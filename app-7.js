function columnNameToIndex(cellReference) {
  const letters = String(cellReference || "")
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }

  return Math.max(0, index - 1);
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 66000);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) {
      return offset;
    }
  }

  return -1;
}

async function inflateRawZipData(data) {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("decompression-unavailable");
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder("utf-8");
  const eocdOffset = findEndOfCentralDirectory(bytes);

  if (eocdOffset < 0) {
    throw new Error("xlsx-zip-invalid");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new Error("xlsx-central-directory-invalid");
    }

    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralOffset + 42, true);
    const fileName = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength));

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error("xlsx-local-header-invalid");
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
    let data = compressedData;

    if (method === 8) {
      data = await inflateRawZipData(compressedData);
    } else if (method !== 0) {
      throw new Error("xlsx-compression-unsupported");
    }

    entries.set(fileName.replace(/^\/+/, ""), data);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeEntry(entries, path) {
  const data = entries.get(path);
  return data ? new TextDecoder("utf-8").decode(data) : "";
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }

  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => {
    const textParts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((textMatch) =>
      decodeXmlEntities(textMatch[1]),
    );
    return textParts.length ? textParts.join("") : stripXmlTags(match[1]);
  });
}

function findFirstWorksheetPath(workbookXml, relationshipsXml) {
  const firstSheet = workbookXml.match(/<sheet\b[^>]*>/i)?.[0] || "";
  const relationId = getXmlAttribute(firstSheet, "r:id") || getXmlAttribute(firstSheet, "id");

  if (!relationId) {
    return "xl/worksheets/sheet1.xml";
  }

  const relationship = [...relationshipsXml.matchAll(/<Relationship\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => getXmlAttribute(tag, "Id") === relationId);
  const target = relationship ? getXmlAttribute(relationship, "Target") : "worksheets/sheet1.xml";

  if (target.startsWith("/")) {
    return target.slice(1);
  }

  return `xl/${target}`.replaceAll("//", "/");
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const values = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const cellAttributes = cellMatch[1];
      const cellBody = cellMatch[2];
      const cellType = getXmlAttribute(cellAttributes, "t");
      const cellReference = getXmlAttribute(cellAttributes, "r");
      const columnIndex = cellReference ? columnNameToIndex(cellReference) : values.length;
      let value = "";

      if (cellType === "inlineStr") {
        value = stripXmlTags(cellBody.match(/<is\b[^>]*>([\s\S]*?)<\/is>/i)?.[1] || cellBody);
      } else {
        const rawValue = decodeXmlEntities(cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "");
        value = cellType === "s" ? sharedStrings[Number(rawValue)] || "" : rawValue;
      }

      values[columnIndex] = value;
    }

    if (values.some((value) => String(value || "").trim())) {
      rows.push(values);
    }
  }

  return rows;
}

async function parseXlsxRecords(file) {
  const entries = await unzipEntries(await file.arrayBuffer());
  const workbookXml = decodeEntry(entries, "xl/workbook.xml");
  const relationshipsXml = decodeEntry(entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(decodeEntry(entries, "xl/sharedStrings.xml"));
  const worksheetPath = findFirstWorksheetPath(workbookXml, relationshipsXml);
  const worksheetXml = decodeEntry(entries, worksheetPath);

  if (!worksheetXml) {
    throw new Error("xlsx-sheet-missing");
  }

  return rowsToRecords(parseWorksheetRows(worksheetXml, sharedStrings));
}

function parseHtmlTableRecords(text) {
  const tableMatch = text.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return [];
  }

  const rows = [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) => stripXmlTags(cellMatch[1]).trim()),
  );

  return rowsToRecords(rows);
}

function parseSpreadsheetXmlRecords(text) {
  const rows = [...text.matchAll(/<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<(?:\w+:)?Cell\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Cell>/gi)].map((cellMatch) => {
      const dataMatch = cellMatch[1].match(/<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i);
      return stripXmlTags(dataMatch ? dataMatch[1] : cellMatch[1]).trim();
    }),
  );

  return rowsToRecords(rows);
}

function looksLikeBinaryXls(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

function decodeWorkbookText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 4));
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8";
  return new TextDecoder(encoding).decode(arrayBuffer);
}

async function parseXlsRecords(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer.slice(0, 4));

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return parseXlsxRecords(file);
  }

  if (looksLikeBinaryXls(arrayBuffer)) {
    throw new Error("legacy-xls-binary");
  }

  const text = decodeWorkbookText(arrayBuffer);
  const xmlRecords = parseSpreadsheetXmlRecords(text);
  if (xmlRecords.length) {
    return xmlRecords;
  }

  const htmlRecords = parseHtmlTableRecords(text);
  if (htmlRecords.length) {
    return htmlRecords;
  }

  return parseCsv(text);
}

async function readImportRecords(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx")) {
    return parseXlsxRecords(file);
  }

  if (name.endsWith(".xls")) {
    return parseXlsRecords(file);
  }

  const text = await file.text();
  const isJson = name.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{");

  if (isJson) {
    const parsed = JSON.parse(text);
    const records = Array.isArray(parsed) ? parsed : parsed.people || [];
    return records.map(normalizeImportObject);
  }

  return parseCsv(text);
}

function pick(record, keys) {
  const normalizedKeys = Object.keys(record);
  const key = normalizedKeys.find((item) => keys.includes(item));
  return key ? record[key] : "";
}

function normalizePeriod(value) {
  const text = String(value || "").trim().toLowerCase();
  const number = Number(text.replace(",", "."));

  if (Number.isFinite(number) && text !== "") {
    if (number >= 10) return "overTen";
    if (number >= 5) return "fiveToTen";
    return "under5";
  }

  if (text === "overten" || text === "over_ten") {
    return "overTen";
  }

  if (text === "fivetoten" || text === "five_to_ten") {
    return "fiveToTen";
  }

  if (text === "under5" || text === "under_5") {
    return "under5";
  }

  if (text.includes("10+") || text.includes("10 anni") || text.includes("piu di 10") || text.includes("più di 10")) {
    return "overTen";
  }

  if (text.includes("5-10") || text.includes("5 a") || text.includes("meno di 10")) {
    return "fiveToTen";
  }

  return "under5";
}

function parseYesNo(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["si", "sì", "s", "yes", "y", "true", "1"].includes(text);
}

function normalizeBirthDate(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const dateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const serial = Number(text.replace(",", "."));
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  return text;
}

function personFromImportRecord(record, index) {
  const nome = pick(record, ["nome", "name"]);
  if (!String(nome || "").trim()) {
    return null;
  }

  return normalizePerson({
    id: createId(),
    nome,
    nickname: pick(record, ["cognome/nickname", "cognome", "nickname", "soprannome"]),
    birthDate: normalizeBirthDate(pick(record, ["data di nascita", "nascita", "birthdate", "birth date", "data nascita"])),
    language: normalizeLanguage(pick(record, ["lingua", "lingua parlata", "language", "parla", "idioma"])),
    churchPeriod: normalizePeriod(pick(record, ["periodo in chiesa", "chiesa", "anni in chiesa", "churchperiod"])),
    baptized: parseYesNo(pick(record, ["battezzato", "battesimo", "baptized"])),
    leaderCandidate: parseYesNo(
      pick(record, ["leader", "può essere leader", "puo essere leader", "leader candidate", "leadercandidate"]),
    ),
    notes: pick(record, ["note", "notes"]),
    createdAt: Date.now() + index,
  });
}

async function importPeopleFile(file) {
  if (!file) {
    return;
  }

  let records = [];

  try {
    records = (await readImportRecords(file)).map((record, index) => personFromImportRecord(normalizeImportObject(record), index));
  } catch (error) {
    if (error.message === "legacy-xls-binary") {
      showToast("Questo XLS è binario: salvalo come XLSX e importalo di nuovo.");
      return;
    }

    showToast("File non leggibile. Usa CSV, JSON, XLSX o un XLS esportato come tabella.");
    return;
  }

  const imported = records.filter(Boolean);
  if (!imported.length) {
    showToast("Nessuna persona valida trovata nel file.");
    return;
  }

  state.people = [...imported, ...state.people];
  imported.forEach((person) => state.presentIds.add(person.id));
  state.currentTeams = [];
  savePeople();
  savePresentSelection();
  renderAll();
  showToast(`${imported.length} persone importate e segnate presenti.`);
}

function normalizeImportObject(record) {
  return Object.entries(record || {}).reduce((normalized, [key, value]) => {
    normalized[String(key).trim().toLowerCase()] = value;
    return normalized;
  }, {});
}

function loadExamples() {
  const examples = examplePeople.map((person) =>
    normalizePerson({
      ...person,
      id: createId(),
      createdAt: Date.now() + Math.random(),
    }),
  );
  state.people = [...examples, ...state.people];
  examples.forEach((person) => state.presentIds.add(person.id));
  savePeople();
  savePresentSelection();
  renderAll();
  showToast("Dati esempio caricati e segnati presenti.");
}

function clearPeople() {
  const ok = confirm("Svuotare tutto il database persone?");
  if (!ok) {
    return;
  }

  stopGeneration(false);
  closeOverlay();
  state.people = [];
  state.presentIds = new Set();
  state.dailyLeaderIds = new Set();
  state.databaseSelectedIds = new Set();
  state.currentTeams = [];
  savePeople();
  savePresentSelection();
  saveDailyLeaders();
  resetForm();
  els.teamsGrid.replaceChildren();
  els.overlayTeamsGrid.replaceChildren();
  els.resultMeta.textContent = "Scegli i presenti e premi Inizio full screen.";
  renderAll();
  showToast("Database svuotato.");
}
