function renderPeople() {
  els.peopleRows.replaceChildren();
  pruneDatabaseSelection();

  const sorted = getFilteredDatabasePeople();
  els.emptyPeople.hidden = state.people.length > 0 && sorted.length > 0;
  els.emptyPeople.textContent = state.people.length
    ? "Nessuna persona trovata con questa ricerca."
    : "Nessuna persona salvata";
  updateDatabaseSelectionControls(sorted.length);

  sorted.forEach((person) => {
    const row = document.createElement("tr");

    const selectCell = document.createElement("td");
    selectCell.className = "select-col";
    const checkbox = document.createElement("input");
    checkbox.className = "database-select-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = state.databaseSelectedIds.has(person.id);
    checkbox.setAttribute("aria-label", `Seleziona ${formatName(person) || "persona"}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.databaseSelectedIds.add(person.id);
      } else {
        state.databaseSelectedIds.delete(person.id);
      }
      updateDatabaseSelectionControls(sorted.length);
    });
    selectCell.append(checkbox);

    const nameCell = document.createElement("td");
    nameCell.className = "name-cell";
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = formatName(person) || "Senza nome";
    nameCell.append(nameStrong);
    if (person.notes) {
      const notes = document.createElement("small");
      notes.textContent = person.notes;
      nameCell.append(notes);
    }

    const birthDateCell = document.createElement("td");
    birthDateCell.textContent = formatItalianDate(person.birthDate);

    const languageCell = document.createElement("td");
    languageCell.append(makeTag(languageLabels[person.language] || languageLabels.chinese, person.language === "chinese"));

    const periodCell = document.createElement("td");
    periodCell.textContent = periodLabels[person.churchPeriod] || periodLabels.under5;

    const baptizedCell = document.createElement("td");
    baptizedCell.append(makeTag(person.baptized ? "Sì" : "No", !person.baptized));

    const leaderCell = document.createElement("td");
    leaderCell.append(makeTag(person.leaderCandidate ? "Sì" : "No", !person.leaderCandidate));

    const pointsCell = document.createElement("td");
    const points = document.createElement("span");
    points.className = "points-badge";
    points.textContent = String(calculateScore(person));
    pointsCell.append(points);

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editButton = document.createElement("button");
    editButton.className = "table-action";
    editButton.type = "button";
    editButton.textContent = "Modifica";
    editButton.addEventListener("click", () => editPerson(person.id));

    const deleteButton = document.createElement("button");
    deleteButton.className = "table-action delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Elimina";
    deleteButton.addEventListener("click", () => deletePerson(person.id));

    actions.append(editButton, deleteButton);
    actionsCell.append(actions);

    row.append(
      selectCell,
      nameCell,
      birthDateCell,
      languageCell,
      periodCell,
      baptizedCell,
      leaderCell,
      pointsCell,
      actionsCell,
    );
    els.peopleRows.append(row);
  });
}

function updateDatabaseSelectionControls(visibleCount = getFilteredDatabasePeople().length) {
  const selectedCount = state.databaseSelectedIds.size;
  els.databaseSelectedCount.textContent = `${selectedCount} selezionat${selectedCount === 1 ? "o" : "i"}`;
  els.selectVisibleDatabase.disabled = visibleCount === 0;
  els.clearDatabaseSelection.disabled = selectedCount === 0;
  els.deleteSelectedPeople.disabled = selectedCount === 0;
}

function renderAttendance() {
  els.attendanceList.replaceChildren();
  const query = state.attendanceSearch.trim().toLowerCase();
  const birthdayIds = new Set(getBirthdayPeople().map(({ person }) => person.id));

  const sorted = [...state.people]
    .filter((person) => {
      const haystack = `${person.nome} ${person.nickname}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => formatName(a).localeCompare(formatName(b), "it"));

  els.emptyAttendance.hidden = state.people.length > 0 && sorted.length > 0;
  els.emptyAttendance.textContent = state.people.length
    ? "Nessuna persona trovata con questa ricerca."
    : "Aggiungi persone nel database per scegliere i presenti.";

  sorted.forEach((person) => {
    const isPresent = state.presentIds.has(person.id);
    const isDailyLeader = state.dailyLeaderIds.has(person.id);
    const item = document.createElement("div");
    item.className = isDailyLeader ? "attendance-item leader-today" : "attendance-item";

    const presenceLabel = document.createElement("label");
    presenceLabel.className = "attendance-presence";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isPresent;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.presentIds.add(person.id);
      } else {
        state.presentIds.delete(person.id);
        state.dailyLeaderIds.delete(person.id);
      }
      state.currentTeams = [];
      els.teamsGrid.replaceChildren();
      els.resultMeta.textContent = "Selezione aggiornata. Premi Inizio full screen.";
      savePresentSelection();
      saveDailyLeaders();
      renderAll();
    });

    const text = document.createElement("span");
    text.className = "attendance-name";
    const strong = document.createElement("strong");
    strong.textContent = formatName(person) || "Senza nome";
    const meta = document.createElement("small");
    meta.textContent = `${languageLabels[person.language] || languageLabels.chinese} · ${periodLabels[person.churchPeriod]}`;
    text.append(strong, meta);
    presenceLabel.append(checkbox, text);

    const tags = document.createElement("span");
    tags.className = "attendance-tags";
    tags.append(makeTag(`${calculateScore(person)} pt`));
    tags.append(makeTag(languageLabels[person.language] || languageLabels.chinese, person.language === "chinese"));
    if (person.leaderCandidate) {
      tags.append(makeTag("Leader"));
    }
    if (birthdayIds.has(person.id)) {
      tags.append(makeTag("Compleanno"));
    }

    const leaderButton = document.createElement("button");
    leaderButton.type = "button";
    leaderButton.className = isDailyLeader ? "daily-leader-button active" : "daily-leader-button";
    leaderButton.textContent = isDailyLeader ? "Leader scelto" : "Leader oggi";
    leaderButton.disabled = !isPresent;
    leaderButton.addEventListener("click", () => {
      if (!state.presentIds.has(person.id)) {
        return;
      }

      if (state.dailyLeaderIds.has(person.id)) {
        state.dailyLeaderIds.delete(person.id);
      } else {
        state.dailyLeaderIds.add(person.id);
      }
      state.currentTeams = [];
      els.teamsGrid.replaceChildren();
      els.resultMeta.textContent = "Leader del giorno aggiornati. Premi Inizio full screen.";
      saveDailyLeaders();
      renderAll();
    });
    tags.append(leaderButton);

    item.append(presenceLabel, tags);
    els.attendanceList.append(item);
  });
}

function makeTag(text, muted = false) {
  const tag = document.createElement("span");
  tag.className = muted ? "tag no" : "tag";
  tag.textContent = text;
  return tag;
}

function editPerson(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) {
    return;
  }

  switchView("database");
  state.editingId = id;
  els.firstName.value = person.nome;
  els.nickname.value = person.nickname;
  els.birthDate.value = person.birthDate || "";
  els.language.value = person.language || "chinese";
  els.churchPeriod.value = person.churchPeriod;
  setRadioValue("baptized", person.baptized ? "yes" : "no");
  setRadioValue("leaderCandidate", person.leaderCandidate ? "yes" : "no");
  els.notes.value = person.notes;
  els.submitPerson.textContent = "Aggiorna persona";
  els.cancelEdit.hidden = false;
  updateScorePreview();
  els.firstName.focus();
}

function deletePerson(id) {
  const person = state.people.find((item) => item.id === id);
  if (!person) {
    return;
  }

  const ok = confirm(`Eliminare ${formatName(person)} dal database?`);
  if (!ok) {
    return;
  }

  state.people = state.people.filter((item) => item.id !== id);
  state.presentIds.delete(id);
  state.dailyLeaderIds.delete(id);
  state.databaseSelectedIds.delete(id);
  state.currentTeams = [];
  if (state.editingId === id) {
    resetForm();
  }
  savePeople();
  savePresentSelection();
  saveDailyLeaders();
  renderAll();
  showToast("Persona eliminata.");
}

function deleteSelectedPeople() {
  pruneDatabaseSelection();
  const selectedIds = new Set(state.databaseSelectedIds);

  if (!selectedIds.size) {
    showToast("Seleziona almeno una persona da eliminare.");
    return;
  }

  const ok = confirm(`Eliminare ${selectedIds.size} persone selezionate dal database?`);
  if (!ok) {
    return;
  }

  state.people = state.people.filter((person) => !selectedIds.has(person.id));
  selectedIds.forEach((id) => {
    state.presentIds.delete(id);
    state.dailyLeaderIds.delete(id);
  });
  if (state.editingId && selectedIds.has(state.editingId)) {
    resetForm();
  }
  state.databaseSelectedIds = new Set();
  state.currentTeams = [];
  savePeople();
  savePresentSelection();
  saveDailyLeaders();
  renderAll();
  showToast(`${selectedIds.size} persone eliminate.`);
}
