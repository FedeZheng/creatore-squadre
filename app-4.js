function validateGeneration() {
  const teamCount = Number(els.teamCount.value);
  const selectedPeople = getSelectedPeople();
  const dailyLeaders = getDailyLeaders();
  const randomLeaderCandidates = selectedPeople.filter(
    (person) => !state.dailyLeaderIds.has(person.id) && person.leaderCandidate,
  );
  const availableLeaders = dailyLeaders.length + randomLeaderCandidates.length;

  if (!Number.isInteger(teamCount) || teamCount < 2) {
    return {
      ok: false,
      teamCount: 0,
      message: "Inserisci almeno 2 squadre.",
    };
  }

  if (selectedPeople.length < teamCount) {
    return {
      ok: false,
      teamCount,
      message: `Seleziona almeno ${teamCount} presenti per creare ${teamCount} squadre. Ora sono ${selectedPeople.length}.`,
    };
  }

  if (dailyLeaders.length > teamCount) {
    return {
      ok: false,
      teamCount,
      message: `Hai scelto ${dailyLeaders.length} leader oggi, ma le squadre sono ${teamCount}. Togli ${dailyLeaders.length - teamCount} leader.`,
    };
  }

  if (availableLeaders < teamCount) {
    return {
      ok: false,
      teamCount,
      message: `Warning: servono ${teamCount} leader totali. Hai ${dailyLeaders.length} leader fissi e ${randomLeaderCandidates.length} candidati casuali.`,
    };
  }

  if (state.languageBalance) {
    const languagePlan = getLanguageTeamPlan(teamCount, selectedPeople);

    if (!languagePlan.ok) {
      return {
        ok: false,
        teamCount,
        message: languagePlan.message,
      };
    }

    if (!canBuildLanguageFormation(teamCount, selectedPeople)) {
      return {
        ok: false,
        teamCount,
        message:
          "Warning: con la divisione per lingua non ci sono abbastanza leader compatibili. Aggiungi leader bilingue o cambia i leader di oggi.",
      };
    }

    return {
      ok: true,
      teamCount,
      message: `Pronto: lingue attive, ${languagePlan.chineseTeams} squadre cinesi e ${languagePlan.italianTeams} italiane. ${dailyLeaders.length} leader fissi.`,
    };
  }

  return {
    ok: true,
    teamCount,
    message: `Pronto: ${dailyLeaders.length} leader fissi, ${teamCount - dailyLeaders.length} leader casuali e ${selectedPeople.length} presenti.`,
  };
}

function renderGenerationStatus() {
  const validation = validateGeneration();
  els.generationStatus.textContent = validation.message;
  els.generationStatus.className = `generation-status ${validation.ok ? "ok" : "warn"}`;
  els.neededLeaders.textContent = String(validation.teamCount || Math.max(2, Number(els.teamCount.value) || 2));
  els.startDraw.disabled = !validation.ok || Boolean(state.timer);
  els.generateOnce.disabled = !validation.ok || Boolean(state.timer);
  renderLanguageBalanceToggle();
}

function renderLanguageBalanceToggle() {
  els.languageBalanceToggle.classList.toggle("active", state.languageBalance);
  els.languageBalanceToggle.setAttribute("aria-pressed", String(state.languageBalance));
  els.languageBalanceToggle.textContent = state.languageBalance ? "Lingue attive" : "Dividi per lingua";
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function teamScore(team) {
  return team.members.reduce((sum, person) => sum + calculateScore(person), 0);
}

function isBilingual(person) {
  return person.language === "bilingual";
}

function canJoinLanguageGroup(person, languageGroup) {
  return !languageGroup || isBilingual(person) || person.language === languageGroup;
}

function getLanguageTeamPlan(teamCount, people) {
  const italianOnly = people.filter((person) => person.language === "italian").length;
  const chineseOnly = people.filter((person) => person.language === "chinese").length;
  const forcedItalian = people.filter((person) => state.dailyLeaderIds.has(person.id) && person.language === "italian").length;
  const forcedChinese = people.filter((person) => state.dailyLeaderIds.has(person.id) && person.language === "chinese").length;

  let italianTeams = 0;

  if (italianOnly > 0 && chineseOnly > 0) {
    italianTeams = Math.round((teamCount * italianOnly) / (italianOnly + chineseOnly));
    italianTeams = Math.max(1, Math.min(teamCount - 1, italianTeams));
  } else if (italianOnly > 0) {
    italianTeams = teamCount;
  }

  italianTeams = Math.max(italianTeams, forcedItalian);
  italianTeams = Math.min(italianTeams, teamCount - forcedChinese);

  const chineseTeams = teamCount - italianTeams;

  if (italianOnly > 0 && italianTeams < 1) {
    return {
      ok: false,
      italianTeams,
      chineseTeams,
      message: "Warning: ci sono persone solo italiane, ma i leader fissi non lasciano nessuna squadra italiana.",
    };
  }

  if (chineseOnly > 0 && chineseTeams < 1) {
    return {
      ok: false,
      italianTeams,
      chineseTeams,
      message: "Warning: ci sono persone solo cinesi, ma i leader fissi non lasciano nessuna squadra cinese.",
    };
  }

  return {
    ok: true,
    italianTeams,
    chineseTeams,
    message: "",
  };
}

function makeLanguageTeams(teamCount, people) {
  const plan = getLanguageTeamPlan(teamCount, people);
  if (!plan.ok) {
    return [];
  }

  const languageGroups = [
    ...Array.from({ length: plan.italianTeams }, () => "italian"),
    ...Array.from({ length: plan.chineseTeams }, () => "chinese"),
  ];

  return shuffle(languageGroups).map((languageGroup, index) => ({
    id: index + 1,
    name: `Squadra ${index + 1}`,
    languageGroup,
    leader: null,
    members: [],
  }));
}

function assignLeaderToCompatibleTeam(teams, person) {
  const compatibleTeams = teams.filter((team) => !team.leader && canJoinLanguageGroup(person, team.languageGroup));

  if (!compatibleTeams.length) {
    return false;
  }

  const exactTeams = compatibleTeams.filter((team) => person.language === team.languageGroup);
  const chosen = shuffle(exactTeams.length ? exactTeams : compatibleTeams)[0];
  chosen.leader = person;
  chosen.members.push(person);
  return true;
}

function assignLanguageLeaders(teams, people) {
  const usedIds = new Set();
  const forcedLeaders = people.filter((person) => state.dailyLeaderIds.has(person.id));
  const forcedMonolingual = shuffle(forcedLeaders.filter((person) => !isBilingual(person)));
  const forcedBilingual = shuffle(forcedLeaders.filter(isBilingual));

  for (const leader of [...forcedMonolingual, ...forcedBilingual]) {
    if (!assignLeaderToCompatibleTeam(teams, leader)) {
      return false;
    }
    usedIds.add(leader.id);
  }

  for (const team of teams.filter((item) => !item.leader)) {
    const pool = people.filter(
      (person) => !usedIds.has(person.id) && person.leaderCandidate && canJoinLanguageGroup(person, team.languageGroup),
    );

    if (!pool.length) {
      return false;
    }

    const exactPool = pool.filter((person) => person.language === team.languageGroup);
    const chosen = shuffle(exactPool.length ? exactPool : pool)[0];
    team.leader = chosen;
    team.members.push(chosen);
    usedIds.add(chosen.id);
  }

  return true;
}

function canBuildLanguageFormation(teamCount, people) {
  const teams = makeLanguageTeams(teamCount, people);
  return teams.length === teamCount && assignLanguageLeaders(teams, people);
}

function chooseTeamForPerson(person, teams) {
  const candidates = teams.filter((team) => canJoinLanguageGroup(person, team.languageGroup));

  if (!candidates.length) {
    return null;
  }

  const minSize = Math.min(...candidates.map((team) => team.members.length));
  const sizeCandidates = candidates.filter((team) => team.members.length === minSize);
  const minScore = Math.min(...sizeCandidates.map(teamScore));
  const scoreCandidates = sizeCandidates.filter((team) => teamScore(team) <= minScore + 1);
  return shuffle(scoreCandidates)[0];
}

function buildOneFormation(teamCount, people) {
  let teams = [];

  if (state.languageBalance) {
    teams = makeLanguageTeams(teamCount, people);
    if (teams.length !== teamCount || !assignLanguageLeaders(teams, people)) {
      return [];
    }
  } else {
    const forcedLeaders = people.filter((person) => state.dailyLeaderIds.has(person.id));
    const forcedIds = new Set(forcedLeaders.map((person) => person.id));
    const leaderPool = shuffle(people.filter((person) => person.leaderCandidate && !forcedIds.has(person.id)));
    const selectedLeaders = [...shuffle(forcedLeaders), ...leaderPool.slice(0, teamCount - forcedLeaders.length)];

    teams = selectedLeaders.map((leader, index) => ({
      id: index + 1,
      name: `Squadra ${index + 1}`,
      languageGroup: "",
      leader,
      members: [leader],
    }));
  }

  const selectedIds = new Set(teams.map((team) => team.leader.id));

  const remaining = shuffle(people.filter((person) => !selectedIds.has(person.id))).sort(
    (a, b) => calculateScore(b) - calculateScore(a) || Math.random() - 0.5,
  );

  for (const person of remaining) {
    const chosen = chooseTeamForPerson(person, teams);
    if (!chosen) {
      return [];
    }
    chosen.members.push(person);
  }

  return teams;
}

function evaluateFormation(teams) {
  if (!teams.length) {
    return Infinity;
  }

  const sizes = teams.map((team) => team.members.length);
  const scores = teams.map(teamScore);
  const sizeGap = Math.max(...sizes) - Math.min(...sizes);
  const scoreGap = Math.max(...scores) - Math.min(...scores);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
  return sizeGap * 100 + scoreGap * 10 + Math.sqrt(variance);
}

function generateBalancedTeams(teamCount, people) {
  let best = null;
  let bestValue = Infinity;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const formation = buildOneFormation(teamCount, people);
    const value = evaluateFormation(formation);
    if (value < bestValue) {
      best = formation;
      bestValue = value;
    }
  }

  return best || [];
}
