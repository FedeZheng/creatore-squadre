function renderTeams(teams, changing = false, target = els.teamsGrid) {
  target.replaceChildren();
  const isOverlay = target === els.overlayTeamsGrid;

  teams.forEach((team) => {
    const card = document.createElement("article");
    card.className = `${changing ? "team-card is-changing" : "team-card"} ${isOverlay ? "overlay-team-card" : ""}`;

    const top = document.createElement("div");
    top.className = "team-top";
    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = team.name;
    const meta = document.createElement("span");
    meta.className = "team-meta";
    meta.textContent = team.languageGroup
      ? `${team.members.length} persone · Squadra ${teamLanguageLabels[team.languageGroup].toLowerCase()}`
      : `${team.members.length} persone`;
    titleWrap.append(title, meta);

    const total = document.createElement("div");
    total.className = "team-total";
    total.textContent = String(teamScore(team));
    top.append(titleWrap, total);

    const leaderBox = document.createElement("div");
    leaderBox.className = "leader-box";
    const leaderLabel = document.createElement("span");
    leaderLabel.textContent = "Leader";
    const leaderName = document.createElement("strong");
    leaderName.textContent = formatName(team.leader);
    leaderBox.append(leaderLabel, leaderName);

    const list = document.createElement("ul");
    list.className = isOverlay ? "member-list compact-member-list" : "member-list";
    team.members
      .filter((person) => person.id !== team.leader.id)
      .forEach((person) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "member-name";
        name.textContent = formatName(person);

        if (isOverlay) {
          item.append(name);
        } else {
          const text = document.createElement("div");
          const memberMeta = document.createElement("small");
          memberMeta.className = "member-meta";
          memberMeta.textContent = person.baptized ? "Battezzato" : periodLabels[person.churchPeriod];
          text.append(name, memberMeta);

          const score = document.createElement("span");
          score.className = "mini-score";
          score.textContent = String(calculateScore(person));

          item.append(text, score);
        }
        list.append(item);
      });

    if (!list.children.length) {
      const empty = document.createElement("li");
      const name = document.createElement("span");
      name.className = "member-name";
      name.textContent = "Solo leader";
      empty.append(name);
      list.append(empty);
    }

    card.append(top, leaderBox, list);
    target.append(card);
  });

  updateFormationMetrics(teams);
}

function updateFormationMetrics(teams) {
  if (!teams.length) {
    els.scoreGap.textContent = "0";
    els.sizeGap.textContent = "0";
    return;
  }

  const sizes = teams.map((team) => team.members.length);
  const scores = teams.map(teamScore);
  els.scoreGap.textContent = String(Math.max(...scores) - Math.min(...scores));
  els.sizeGap.textContent = String(Math.max(...sizes) - Math.min(...sizes));
}

function drawFormation(changing = true) {
  const validation = validateGeneration();
  if (!validation.ok) {
    stopGeneration();
    renderGenerationStatus();
    showToast(validation.message);
    return;
  }

  state.drawCount += 1;
  state.currentTeams = generateBalancedTeams(validation.teamCount, getSelectedPeople());
  renderTeams(state.currentTeams, changing, els.teamsGrid);
  if (state.overlayOpen) {
    renderTeams(state.currentTeams, true, els.overlayTeamsGrid);
    els.drawCounter.textContent = `Combinazione ${state.drawCount}`;
  }
  const now = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  els.resultMeta.textContent = `Ultima combinazione generata alle ${now}.`;
}

function openOverlay() {
  state.overlayOpen = true;
  els.drawOverlay.classList.add("show");
  els.drawOverlay.setAttribute("aria-hidden", "false");
  els.overlayTitle.textContent = "Le squadre stanno girando";
  els.overlayStop.disabled = false;
  els.overlayStop.textContent = "STOP";
  document.body.classList.add("draw-active");

  if (els.drawOverlay.requestFullscreen) {
    els.drawOverlay.requestFullscreen().catch(() => {});
  }
}

function closeOverlay() {
  if (state.timer) {
    stopGeneration(false);
  }
  state.overlayOpen = false;
  els.drawOverlay.classList.remove("show");
  els.drawOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("draw-active");

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

function startGeneration() {
  const validation = validateGeneration();
  if (!validation.ok) {
    renderGenerationStatus();
    switchView("create");
    showToast(validation.message);
    return;
  }

  stopGeneration(false);
  switchView("create");
  state.drawCount = 0;
  openOverlay();
  drawFormation(true);
  state.timer = window.setInterval(() => drawFormation(true), DRAW_INTERVAL_MS);
  els.runState.textContent = "In corso";
  els.runState.classList.add("running");
  els.stopDraw.disabled = false;
  els.startDraw.disabled = true;
  els.generateOnce.disabled = true;
}

function stopGeneration(showMessage = true) {
  if (state.timer) {
    window.clearInterval(state.timer);
    state.timer = null;
  }

  els.runState.textContent = "Fermo";
  els.runState.classList.remove("running");
  els.stopDraw.disabled = true;
  renderGenerationStatus();

  if (showMessage && state.currentTeams.length) {
    els.resultMeta.textContent = "Formazione scelta.";
    renderTeams(state.currentTeams, false, els.teamsGrid);
    if (state.overlayOpen) {
      renderTeams(state.currentTeams, false, els.overlayTeamsGrid);
      els.overlayTitle.textContent = "Formazione scelta";
      els.overlayStop.disabled = true;
      els.overlayStop.textContent = "SCELTO";
    }
  }
}

function renderAll() {
  savePresentSelection();
  saveDailyLeaders();
  renderStats();
  renderPeople();
  renderAttendance();
  renderBirthdayBanner();
  renderGenerationStatus();
  if (state.currentTeams.length) {
    renderTeams(state.currentTeams, false, els.teamsGrid);
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function downloadFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
