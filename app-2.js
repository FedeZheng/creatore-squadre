function createId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? "no";
}

function setRadioValue(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
  }
}

function calculateScore(person) {
  const churchScore = periodScores[person.churchPeriod] ?? 0;
  const baptizedScore = person.baptized ? 2 : 0;
  return churchScore + baptizedScore;
}

function formatItalianDate(isoDate) {
  if (!isoDate) {
    return "-";
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return "-";
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function formatDateObjectItalian(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatName(person) {
  return [person.nome, person.nickname].filter(Boolean).join(" ");
}

function normalizePerson(raw) {
  const birthDate = String(raw.birthDate || "").trim();

  return {
    id: raw.id || createId(),
    nome: String(raw.nome || "").trim(),
    nickname: String(raw.nickname || "").trim(),
    birthDate,
    language: normalizeLanguage(raw.language || raw.lingua || raw.linguaParlata),
    churchPeriod: raw.churchPeriod || "under5",
    baptized: Boolean(raw.baptized),
    leaderCandidate: Boolean(raw.leaderCandidate),
    notes: String(raw.notes || "").trim(),
    createdAt: raw.createdAt || Date.now(),
  };
}

function normalizeLanguage(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  if (!text) {
    return "chinese";
  }

  if (
    text.includes("biling") ||
    text.includes("entramb") ||
    text.includes("mista") ||
    text.includes("mixed") ||
    text.includes("both") ||
    (text.includes("ital") && (text.includes("cin") || text.includes("chin") || text.includes("mand")))
  ) {
    return "bilingual";
  }

  if (text.includes("ital") || text === "it" || text === "italiano") {
    return "italian";
  }

  return "chinese";
}

function getSelectedPeople() {
  return state.people.filter((person) => state.presentIds.has(person.id));
}

function getFilteredDatabasePeople() {
  const query = state.databaseSearch.trim().toLowerCase();
  const sorted = [...state.people].sort((a, b) => b.createdAt - a.createdAt);

  if (!query) {
    return sorted;
  }

  return sorted.filter((person) => {
    const searchableText = [
      person.nome,
      person.nickname,
      person.notes,
      formatItalianDate(person.birthDate),
      languageLabels[person.language],
      periodLabels[person.churchPeriod],
      person.baptized ? "battezzato si" : "non battezzato no",
      person.leaderCandidate ? "leader si" : "leader no",
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query);
  });
}

function getDailyLeaders() {
  return getSelectedPeople().filter((person) => state.dailyLeaderIds.has(person.id));
}

function pruneDailyLeaders() {
  const presentIds = new Set(getSelectedPeople().map((person) => person.id));
  state.dailyLeaderIds = new Set([...state.dailyLeaderIds].filter((id) => presentIds.has(id)));
}

function pruneDatabaseSelection() {
  const peopleIds = new Set(state.people.map((person) => person.id));
  state.databaseSelectedIds = new Set([...state.databaseSelectedIds].filter((id) => peopleIds.has(id)));
}

function loadPeople() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    state.people = Array.isArray(saved) ? saved.map(normalizePerson) : [];
  } catch {
    state.people = [];
    showToast("Database locale non leggibile: riparto vuoto.");
  }
}

function loadPresentSelection() {
  const peopleIds = new Set(state.people.map((person) => person.id));
  const saved = localStorage.getItem(PRESENT_STORAGE_KEY);

  if (!saved) {
    state.presentIds = new Set(state.people.map((person) => person.id));
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    const ids = Array.isArray(parsed) ? parsed.filter((id) => peopleIds.has(id)) : [];
    state.presentIds = new Set(ids);
  } catch {
    state.presentIds = new Set(state.people.map((person) => person.id));
  }
}

function loadDailyLeaders() {
  const presentIds = new Set(getSelectedPeople().map((person) => person.id));
  const saved = localStorage.getItem(DAILY_LEADERS_STORAGE_KEY);

  if (!saved) {
    state.dailyLeaderIds = new Set();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    const ids = Array.isArray(parsed) ? parsed.filter((id) => presentIds.has(id)) : [];
    state.dailyLeaderIds = new Set(ids);
  } catch {
    state.dailyLeaderIds = new Set();
  }
}

function savePeople() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.people));
  els.saveStatus.textContent = `Salvato nel browser alle ${new Date().toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function savePresentSelection() {
  const validIds = new Set(state.people.map((person) => person.id));
  state.presentIds = new Set([...state.presentIds].filter((id) => validIds.has(id)));
  pruneDailyLeaders();
  localStorage.setItem(PRESENT_STORAGE_KEY, JSON.stringify([...state.presentIds]));
}

function saveDailyLeaders() {
  pruneDailyLeaders();
  localStorage.setItem(DAILY_LEADERS_STORAGE_KEY, JSON.stringify([...state.dailyLeaderIds]));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getBirthdayWindow(referenceDate = new Date()) {
  const today = startOfDay(referenceDate);
  const thursday = 4;
  const daysSinceThursday = (today.getDay() - thursday + 7) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysSinceThursday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function birthdayDateForYear(birthDate, year) {
  const [birthYear, month, day] = String(birthDate || "")
    .split("-")
    .map(Number);
  if (!birthYear || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) {
    return month === 2 && day === 29 ? new Date(year, 1, 28) : null;
  }
  return date;
}

function isDateInRange(date, start, end) {
  if (!date) {
    return false;
  }
  const normalized = startOfDay(date).getTime();
  return normalized >= start.getTime() && normalized <= end.getTime();
}

function getBirthdayPeople(referenceDate = new Date()) {
  const { start, end } = getBirthdayWindow(referenceDate);
  return state.people
    .map((person) => {
      const thisYear = birthdayDateForYear(person.birthDate, start.getFullYear());
      const nextYear = birthdayDateForYear(person.birthDate, end.getFullYear());
      const birthdayDate = isDateInRange(thisYear, start, end) ? thisYear : nextYear;
      return {
        person,
        birthdayDate: isDateInRange(birthdayDate, start, end) ? birthdayDate : null,
      };
    })
    .filter((item) => item.birthdayDate)
    .sort((a, b) => a.birthdayDate - b.birthdayDate || formatName(a.person).localeCompare(formatName(b.person), "it"));
}

function formatBirthdayWindowText() {
  const { start, end } = getBirthdayWindow();
  return `Dal ${formatDateObjectItalian(start)} al ${formatDateObjectItalian(end)}`;
}

function renderBirthdayBanner() {
  const birthdays = getBirthdayPeople();
  els.birthdayBanner.hidden = birthdays.length === 0;

  if (!birthdays.length) {
    els.birthdayBannerNames.textContent = "";
    return;
  }

  const names = birthdays.map(({ person }) => formatName(person)).join(", ");
  els.birthdayBannerNames.textContent = names;
}

function openBirthdayOverlay() {
  const birthdays = getBirthdayPeople();
  if (!birthdays.length) {
    return;
  }

  els.birthdayPeople.replaceChildren();
  els.birthdayWindowText.textContent = formatBirthdayWindowText();

  birthdays.forEach(({ person, birthdayDate }) => {
    const card = document.createElement("article");
    card.className = "birthday-card";

    const emoji = document.createElement("div");
    emoji.className = "birthday-emoji";
    emoji.textContent = "🎉";

    const name = document.createElement("strong");
    name.textContent = formatName(person);

    const date = document.createElement("span");
    date.textContent = formatDateObjectItalian(birthdayDate);

    card.append(emoji, name, date);
    els.birthdayPeople.append(card);
  });

  els.birthdayOverlay.classList.add("show");
  els.birthdayOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("draw-active");

  if (els.birthdayOverlay.requestFullscreen) {
    els.birthdayOverlay.requestFullscreen().catch(() => {});
  }
}

function closeBirthdayOverlay() {
  els.birthdayOverlay.classList.remove("show");
  els.birthdayOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("draw-active");

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function getFormPerson() {
  return normalizePerson({
    id: state.editingId || createId(),
    nome: els.firstName.value,
    nickname: els.nickname.value,
    birthDate: els.birthDate.value,
    language: els.language.value,
    churchPeriod: els.churchPeriod.value,
    baptized: getRadioValue("baptized") === "yes",
    leaderCandidate: getRadioValue("leaderCandidate") === "yes",
    notes: els.notes.value,
    createdAt: state.editingId
      ? state.people.find((person) => person.id === state.editingId)?.createdAt
      : Date.now(),
  });
}

function resetForm() {
  state.editingId = null;
  els.form.reset();
  els.churchPeriod.value = "under5";
  els.language.value = "chinese";
  setRadioValue("baptized", "no");
  setRadioValue("leaderCandidate", "no");
  els.submitPerson.textContent = "Aggiungi persona";
  els.cancelEdit.hidden = true;
  updateScorePreview();
}

function updateScorePreview() {
  const preview = getFormPerson();
  els.scorePreview.textContent = String(calculateScore(preview));
}

function switchView(viewName) {
  const isCreate = viewName === "create";
  els.databaseView.classList.toggle("active-view", !isCreate);
  els.createView.classList.toggle("active-view", isCreate);
  els.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

function renderStats() {
  const leaderCount = state.people.filter((person) => person.leaderCandidate).length;
  const selectedPeople = getSelectedPeople();
  const dailyLeaders = getDailyLeaders();
  const selectedScore = selectedPeople.reduce((sum, person) => sum + calculateScore(person), 0);

  els.totalPeople.textContent = String(state.people.length);
  els.totalLeaders.textContent = String(leaderCount);
  els.selectedTodaySummary.textContent = String(selectedPeople.length);
  els.selectedPeopleCount.textContent = String(selectedPeople.length);
  els.selectedLeadersCount.textContent = String(dailyLeaders.length);
  els.selectedScoreTotal.textContent = String(selectedScore);
}
