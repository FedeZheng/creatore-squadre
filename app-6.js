function peopleToCsv(people) {
  const rows = people.map((person) => [
    person.nome,
    person.nickname,
    person.birthDate,
    languageLabels[person.language] || languageLabels.chinese,
    periodLabels[person.churchPeriod] || periodLabels.under5,
    person.baptized ? "Si" : "No",
    person.leaderCandidate ? "Si" : "No",
    person.notes,
  ]);

  return [importHeaders, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
}

function exportPeopleCsv() {
  if (!state.people.length) {
    showToast("Il database è vuoto.");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`database-persone-${date}.csv`, peopleToCsv(state.people), "text/csv;charset=utf-8");
  showToast("Database esportato in CSV.");
}

function downloadTemplateCsv() {
  const instructionRows = [
    ["# MODELLO IMPORT PERSONE"],
    ["# Le righe che iniziano con # sono istruzioni e vengono ignorate durante l'import."],
    ["# Non cambiare i titoli della riga delle colonne."],
    ["# Nome: obbligatorio. Cognome/Nickname: facoltativo."],
    ["# Data di nascita: facoltativa. Formati accettati: AAAA-MM-GG oppure GG/MM/AAAA."],
    ["# Lingua: se lasci vuoto viene importato come Cinese. Valori: Cinese, Solo italiano, Bilingue."],
    ["# Periodo in chiesa: Meno di 5 anni, 5-10 anni, 10+ anni. Puoi anche scrivere 0, 5 o 10."],
    ["# Battezzato e Leader: scrivi Si oppure No."],
    ["# Note: facoltative."],
    ["# Esempio da copiare in una nuova riga sotto i titoli: Mario;Rossi;2001-04-20;Bilingue;5-10 anni;Si;No;Aiuta con traduzione"],
    importHeaders,
    ["", "", "", "", "", "", "", ""],
  ];

  downloadFile("modello-persone.csv", `${instructionRows.map((row) => row.map(csvEscape).join(";")).join("\n")}\n`, "text/csv;charset=utf-8");
  showToast("Modello CSV scaricato.");
}

function isInstructionRow(row) {
  const firstValue = String(row.find((value) => String(value || "").trim()) || "")
    .replace(/^\uFEFF/, "")
    .trim();
  return firstValue.startsWith("#");
}

function detectDelimiter(text) {
  const firstLine = text
    .split(/\r?\n/)
    .find((line) => {
      const cleanLine = line.replace(/^\uFEFF/, "").trim();
      return cleanLine && !cleanLine.startsWith("#");
    }) || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  return rowsToRecords(rows);
}

function rowsToRecords(rows) {
  const cleanRows = rows.filter((row) => row.some((value) => String(value || "").trim()) && !isInstructionRow(row));
  if (!cleanRows.length) {
    return [];
  }

  const headers = cleanRows[0].map((header) => normalizeImportHeader(header));
  return cleanRows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index] ?? "";
      return record;
    }, {}),
  );
}

function normalizeImportHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function stripXmlTags(value) {
  return decodeXmlEntities(String(value || "").replace(/<[^>]+>/g, ""));
}

function getXmlAttribute(source, name) {
  const match = String(source || "").match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeXmlEntities(match[1] ?? match[2] ?? "") : "";
}
