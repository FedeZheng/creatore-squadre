els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const person = getFormPerson();

  if (!person.nome) {
    showToast("Inserisci il nome.");
    els.firstName.focus();
    return;
  }

  if (state.editingId) {
    state.people = state.people.map((item) => (item.id === state.editingId ? person : item));
    showToast("Persona aggiornata.");
  } else {
    state.people.push(person);
    state.presentIds.add(person.id);
    showToast("Persona aggiunta e segnata presente oggi.");
  }

  savePeople();
  savePresentSelection();
  resetForm();
  renderAll();
});

els.form.addEventListener("input", updateScorePreview);
els.form.addEventListener("change", updateScorePreview);
els.cancelEdit.addEventListener("click", resetForm);
els.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});
els.teamCount.addEventListener("input", () => {
  stopGeneration(false);
  renderGenerationStatus();
});
els.startDraw.addEventListener("click", startGeneration);
els.stopDraw.addEventListener("click", () => stopGeneration(true));
els.overlayStop.addEventListener("click", () => stopGeneration(true));
els.closeOverlay.addEventListener("click", closeOverlay);
els.birthdayBanner.addEventListener("click", openBirthdayOverlay);
els.closeBirthdayOverlay.addEventListener("click", closeBirthdayOverlay);
els.generateOnce.addEventListener("click", () => {
  switchView("create");
  drawFormation(false);
});
els.languageBalanceToggle.addEventListener("click", () => {
  stopGeneration(false);
  state.languageBalance = !state.languageBalance;
  state.currentTeams = [];
  els.teamsGrid.replaceChildren();
  els.overlayTeamsGrid.replaceChildren();
  els.resultMeta.textContent = state.languageBalance
    ? "Divisione per lingua attiva. Premi Inizio full screen."
    : "Divisione per lingua disattivata. Premi Inizio full screen.";
  renderGenerationStatus();
});
els.loadExamples.addEventListener("click", loadExamples);
els.clearPeople.addEventListener("click", clearPeople);
els.downloadTemplate.addEventListener("click", downloadTemplateCsv);
els.exportData.addEventListener("click", exportPeopleCsv);
els.importData.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  await importPeopleFile(els.importFile.files?.[0]);
  els.importFile.value = "";
});
els.databaseSearch.addEventListener("input", () => {
  state.databaseSearch = els.databaseSearch.value;
  renderPeople();
});
els.selectVisibleDatabase.addEventListener("click", () => {
  const visiblePeople = getFilteredDatabasePeople();
  visiblePeople.forEach((person) => state.databaseSelectedIds.add(person.id));
  renderPeople();
  showToast(`${visiblePeople.length} persone selezionate.`);
});
els.clearDatabaseSelection.addEventListener("click", () => {
  state.databaseSelectedIds = new Set();
  renderPeople();
  showToast("Selezione database svuotata.");
});
els.deleteSelectedPeople.addEventListener("click", deleteSelectedPeople);
els.attendanceSearch.addEventListener("input", () => {
  state.attendanceSearch = els.attendanceSearch.value;
  renderAttendance();
});
els.selectAllToday.addEventListener("click", () => {
  state.presentIds = new Set(state.people.map((person) => person.id));
  state.currentTeams = [];
  savePresentSelection();
  renderAll();
  showToast("Tutti segnati presenti.");
});
els.clearToday.addEventListener("click", () => {
  state.presentIds = new Set();
  state.dailyLeaderIds = new Set();
  state.currentTeams = [];
  savePresentSelection();
  saveDailyLeaders();
  els.teamsGrid.replaceChildren();
  renderAll();
  showToast("Lista presenti svuotata.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.overlayOpen) {
    closeOverlay();
  }
  if (event.key === "Escape" && els.birthdayOverlay.classList.contains("show")) {
    closeBirthdayOverlay();
  }
});

loadPeople();
loadPresentSelection();
loadDailyLeaders();
updateScorePreview();
renderAll();
