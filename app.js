import { parseRecordSummary, parseStreakValue } from "./lib/bettingMath.js";
import { buildPredictions } from "./lib/predictionModel.js";
import { renderPredictionDashboard } from "./components/PredictionDashboard.js";

const TEAM_META = {
  ATL: { conference: "Eastern", division: "Southeast" },
  BOS: { conference: "Eastern", division: "Atlantic" },
  BKN: { conference: "Eastern", division: "Atlantic" },
  CHA: { conference: "Eastern", division: "Southeast" },
  CHI: { conference: "Eastern", division: "Central" },
  CLE: { conference: "Eastern", division: "Central" },
  DET: { conference: "Eastern", division: "Central" },
  IND: { conference: "Eastern", division: "Central" },
  MIA: { conference: "Eastern", division: "Southeast" },
  MIL: { conference: "Eastern", division: "Central" },
  NY: { conference: "Eastern", division: "Atlantic" },
  ORL: { conference: "Eastern", division: "Southeast" },
  PHI: { conference: "Eastern", division: "Atlantic" },
  TOR: { conference: "Eastern", division: "Atlantic" },
  WSH: { conference: "Eastern", division: "Southeast" },
  DAL: { conference: "Western", division: "Southwest" },
  DEN: { conference: "Western", division: "Northwest" },
  GS: { conference: "Western", division: "Pacific" },
  HOU: { conference: "Western", division: "Southwest" },
  LAC: { conference: "Western", division: "Pacific" },
  LAL: { conference: "Western", division: "Pacific" },
  MEM: { conference: "Western", division: "Southwest" },
  MIN: { conference: "Western", division: "Northwest" },
  NO: { conference: "Western", division: "Southwest" },
  OKC: { conference: "Western", division: "Northwest" },
  PHX: { conference: "Western", division: "Pacific" },
  POR: { conference: "Western", division: "Northwest" },
  SAC: { conference: "Western", division: "Pacific" },
  SA: { conference: "Western", division: "Southwest" },
  UTA: { conference: "Western", division: "Northwest" },
  UTAH: { conference: "Western", division: "Northwest" }
};

const FALLBACK_PAYLOAD = {
  source: "Fallback demo snapshot",
  games: [
    {
      id: "demo-1",
      name: "Boston Celtics at New York Knicks",
      status: "Scheduled",
      detail: "Sun, May 17th at 7:30 PM EDT",
      shortDetail: "5/17 - 7:30 PM EDT",
      eventState: "pre",
      isUpcoming: true,
      seriesText: "East semifinal - Game 6",
      venue: { fullName: "Madison Square Garden" },
      odds: {
        provider: "Fallback sportsbook",
        moneyline: { homeOdds: "+120", awayOdds: "-142" },
        spread: { homeLine: "+3.5", awayLine: "-3.5" },
        total: { line: "212.5" }
      },
      teams: [
        { name: "New York Knicks", abbreviation: "NY", score: 0, winner: false, order: 0, homeAway: "home" },
        { name: "Boston Celtics", abbreviation: "BOS", score: 0, winner: false, order: 1, homeAway: "away" }
      ]
    },
    {
      id: "demo-2",
      name: "Minnesota Timberwolves at Oklahoma City Thunder",
      status: "Scheduled",
      detail: "Sun, May 17th at 9:00 PM EDT",
      shortDetail: "5/17 - 9:00 PM EDT",
      eventState: "pre",
      isUpcoming: true,
      seriesText: "West semifinal - Game 6",
      venue: { fullName: "Paycom Center" },
      odds: {
        provider: "Fallback sportsbook",
        moneyline: { homeOdds: "-155", awayOdds: "+132" },
        spread: { homeLine: "-4.0", awayLine: "+4.0" },
        total: { line: "215.5" }
      },
      teams: [
        { name: "Oklahoma City Thunder", abbreviation: "OKC", score: 0, winner: false, order: 0, homeAway: "home" },
        { name: "Minnesota Timberwolves", abbreviation: "MIN", score: 0, winner: false, order: 1, homeAway: "away" }
      ]
    }
  ],
  standings: [
    ["CLE", "Cleveland Cavaliers", 1, 64, 18, 0.780, "W3", "7-3", "34-7", "30-10", 119.5, 109.4],
    ["BOS", "Boston Celtics", 2, 61, 21, 0.744, "W2", "8-2", "32-9", "29-12", 117.8, 109.7],
    ["NY", "New York Knicks", 3, 55, 27, 0.671, "L1", "6-4", "29-12", "26-15", 114.0, 110.6],
    ["IND", "Indiana Pacers", 4, 50, 32, 0.610, "W1", "6-4", "27-14", "23-18", 116.2, 113.8],
    ["MIL", "Milwaukee Bucks", 5, 48, 34, 0.585, "L2", "5-5", "28-13", "20-21", 115.6, 113.7],
    ["ORL", "Orlando Magic", 6, 47, 35, 0.573, "W2", "6-4", "26-15", "21-20", 109.5, 107.9],
    ["OKC", "Oklahoma City Thunder", 1, 68, 14, 0.829, "W5", "9-1", "35-6", "33-8", 120.4, 108.1],
    ["HOU", "Houston Rockets", 2, 54, 28, 0.659, "W1", "7-3", "30-11", "24-17", 114.2, 110.0],
    ["LAL", "Los Angeles Lakers", 3, 51, 31, 0.622, "W2", "7-3", "28-13", "23-18", 116.7, 113.9],
    ["DEN", "Denver Nuggets", 4, 50, 32, 0.610, "L1", "5-5", "27-14", "23-18", 115.4, 112.8],
    ["LAC", "Los Angeles Clippers", 5, 49, 33, 0.598, "W1", "6-4", "26-15", "23-18", 114.8, 111.7],
    ["MIN", "Minnesota Timberwolves", 6, 48, 34, 0.585, "W4", "8-2", "25-16", "23-18", 112.6, 109.8]
  ].map(([abbreviation, name, seed, wins, losses, winPct, streak, lastTen, homeRecord, roadRecord, avgPointsFor, avgPointsAgainst]) => {
    const meta = TEAM_META[abbreviation];
    return {
      abbreviation,
      name,
      seed,
      wins,
      losses,
      winPct,
      streak,
      streakValue: parseStreakValue(streak),
      lastTen,
      lastTenPct: parseRecordSummary(lastTen).pct,
      homeWinPct: parseRecordSummary(homeRecord).pct,
      roadWinPct: parseRecordSummary(roadRecord).pct,
      avgPointsFor,
      avgPointsAgainst,
      avgPointDiff: avgPointsFor - avgPointsAgainst,
      pointsFor: avgPointsFor * (wins + losses),
      pointsAgainst: avgPointsAgainst * (wins + losses),
      conference: meta.conference,
      division: meta.division,
      gamesBehind: "0"
    };
  })
};

const state = {
  source: "",
  games: [],
  standings: [],
  predictions: [],
  filters: {
    search: "",
    conference: "all",
    division: "all",
    sortBy: "winPct",
    targetConfidence: 60
  }
};

const elements = {
  status: document.querySelector("#statusText"),
  refreshButton: document.querySelector("#refreshButton"),
  search: document.querySelector("#teamSearch"),
  conference: document.querySelector("#conferenceFilter"),
  division: document.querySelector("#divisionFilter"),
  sortBy: document.querySelector("#sortBy"),
  summaryStats: document.querySelector("#summaryStats"),
  gamesGrid: document.querySelector("#gamesGrid"),
  predictionDashboard: document.querySelector("#predictionDashboard"),
  conferenceBoards: document.querySelector("#conferenceBoards"),
  divisionCards: document.querySelector("#divisionCards"),
  teamCards: document.querySelector("#teamCards"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate")
};

function setStatus(message) {
  elements.status.textContent = message;
}

function formatPct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function getStatValue(stats, names, fallback = null) {
  const wanted = new Set(names);
  const stat = stats.find((item) => wanted.has(item.name));
  if (!stat) {
    return fallback;
  }

  return stat.value ?? stat.displayValue ?? fallback;
}

function normalizeStandings(raw) {
  const entries = [];

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (Array.isArray(node.entries)) {
      entries.push(...node.entries);
    }

    Object.values(node).forEach(visit);
  };

  visit(raw);

  const deduped = new Map();

  entries.forEach((entry) => {
    const team = entry.team || entry;
    const abbreviation = team.abbreviation;
    const meta = TEAM_META[abbreviation];

    if (!abbreviation || !meta) {
      return;
    }

    const stats = entry.stats || [];
    const wins = Number(getStatValue(stats, ["wins"], 0)) || 0;
    const losses = Number(getStatValue(stats, ["losses"], 0)) || 0;
    const gamesPlayed = wins + losses;
    const homeRecord = getStatValue(stats, ["Home"], "0-0");
    const roadRecord = getStatValue(stats, ["Road"], "0-0");
    const lastTen = getStatValue(stats, ["Last Ten Games"], "5-5");
    const pointsFor = Number(getStatValue(stats, ["pointsFor"], 0)) || 0;
    const pointsAgainst = Number(getStatValue(stats, ["pointsAgainst"], 0)) || 0;

    deduped.set(abbreviation, {
      abbreviation,
      name: team.displayName || team.shortDisplayName || team.name || abbreviation,
      seed: Number(getStatValue(stats, ["playoffSeed", "seed"], 0)) || 0,
      wins,
      losses,
      winPct: Number(getStatValue(stats, ["winPercent", "winPct"], gamesPlayed ? wins / gamesPlayed : 0)) || 0,
      streak: String(getStatValue(stats, ["streak"], "Even")),
      streakValue: parseStreakValue(String(getStatValue(stats, ["streak"], "Even"))),
      lastTen,
      lastTenPct: parseRecordSummary(lastTen).pct,
      homeWinPct: parseRecordSummary(homeRecord).pct,
      roadWinPct: parseRecordSummary(roadRecord).pct,
      gamesBehind: String(getStatValue(stats, ["gamesBehind", "gb"], "0")),
      pointsFor,
      pointsAgainst,
      avgPointsFor: gamesPlayed ? pointsFor / gamesPlayed : 0,
      avgPointsAgainst: gamesPlayed ? pointsAgainst / gamesPlayed : 0,
      avgPointDiff: gamesPlayed ? (pointsFor - pointsAgainst) / gamesPlayed : 0,
      conference: meta.conference,
      division: meta.division
    });
  });

  return [...deduped.values()];
}

function normalizeGameOdds(competition) {
  const odds = competition.odds?.[0];

  return {
    provider: odds?.provider?.name || odds?.header?.text || "Sportsbook line",
    details: odds?.details || "",
    moneyline: {
      homeOdds: odds?.moneyline?.home?.close?.odds || odds?.moneyline?.home?.open?.odds || null,
      awayOdds: odds?.moneyline?.away?.close?.odds || odds?.moneyline?.away?.open?.odds || null
    },
    spread: {
      homeLine: odds?.pointSpread?.home?.close?.line || odds?.pointSpread?.home?.open?.line || null,
      awayLine: odds?.pointSpread?.away?.close?.line || odds?.pointSpread?.away?.open?.line || null
    },
    total: {
      line:
        odds?.total?.over?.close?.line ||
        odds?.total?.under?.close?.line ||
        odds?.total?.over?.open?.line ||
        odds?.total?.under?.open?.line ||
        null
    }
  };
}

function normalizeGames(raw) {
  const events = Array.isArray(raw?.events) ? raw.events : [];

  return events.map((event) => {
    const competition = event.competitions?.[0] || {};
    const competitors = (competition.competitors || [])
      .map((competitor, index) => ({
        name: competitor.team?.displayName || competitor.team?.name || "Team",
        abbreviation: competitor.team?.abbreviation || competitor.team?.shortDisplayName || "NBA",
        score: Number(competitor.score || 0),
        winner: Boolean(competitor.winner),
        order: Number.isFinite(competitor.order) ? competitor.order : index,
        homeAway: competitor.homeAway || "neutral",
        overallRecord: competitor.records?.find((record) => record.name === "overall" || record.type === "total")?.summary || competitor.record || "0-0"
      }))
      .sort((a, b) => a.order - b.order);

    const eventState = event.status?.type?.state || competition.status?.type?.state || "pre";

    return {
      id: event.id,
      name: event.name || "Playoff game",
      status: competition.status?.type?.shortDetail || event.status?.type?.name || "Scheduled",
      detail: competition.status?.type?.detail || event.status?.type?.description || "",
      shortDetail: competition.status?.type?.shortDetail || "",
      eventState,
      isUpcoming: eventState === "pre",
      date: competition.date || event.date || "",
      seriesText: competition.notes?.[0]?.headline || event.season?.slug || "Postseason matchup",
      venue: competition.venue || null,
      odds: normalizeGameOdds(competition),
      teams: competitors
    };
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadData() {
  setStatus("Loading live playoff, standings, and prediction data...");

  try {
    const [scoreboard, standings] = await Promise.all([
      fetchJson("/api/playoffs"),
      fetchJson("/api/standings")
    ]);

    state.source = scoreboard.source || standings.source || "Live ESPN data";
    state.games = normalizeGames(scoreboard);
    state.standings = normalizeStandings(standings);
    state.predictions = buildPredictions(state.games, state.standings);

    if (!state.games.length || !state.standings.length) {
      throw new Error("Live feed returned incomplete data.");
    }

    setStatus(`Showing live postseason scores, standings, and model leans from ${state.source}.`);
  } catch (error) {
    console.error(error);
    state.source = FALLBACK_PAYLOAD.source;
    state.games = FALLBACK_PAYLOAD.games;
    state.standings = FALLBACK_PAYLOAD.standings;
    state.predictions = buildPredictions(state.games, state.standings);
    setStatus("Live feeds were unavailable, so a demo playoff snapshot and sample leans are shown.");
  }

  populateFilters();
  render();
}

function populateFilters() {
  const conferences = [...new Set(state.standings.map((team) => team.conference))].sort();
  const divisions = [...new Set(state.standings.map((team) => team.division))].sort();

  elements.conference.innerHTML = `<option value="all">All conferences</option>${conferences
    .map((conference) => `<option value="${conference}">${conference}</option>`)
    .join("")}`;

  elements.division.innerHTML = `<option value="all">All divisions</option>${divisions
    .map((division) => `<option value="${division}">${division}</option>`)
    .join("")}`;

  elements.conference.value = state.filters.conference;
  elements.division.value = state.filters.division;
}

function getFilteredTeams() {
  const searchText = state.filters.search.trim().toLowerCase();

  return state.standings
    .filter((team) => state.filters.conference === "all" || team.conference === state.filters.conference)
    .filter((team) => state.filters.division === "all" || team.division === state.filters.division)
    .filter((team) => !searchText || `${team.name} ${team.abbreviation}`.toLowerCase().includes(searchText))
    .sort((a, b) => {
      switch (state.filters.sortBy) {
        case "wins":
          return b.wins - a.wins || b.winPct - a.winPct;
        case "seed":
          return a.seed - b.seed || b.winPct - a.winPct;
        case "streak":
          return String(b.streak).localeCompare(String(a.streak));
        case "winPct":
        default:
          return b.winPct - a.winPct || b.wins - a.wins;
      }
    });
}

function getPlayoffTeamSet() {
  return new Set(state.games.flatMap((game) => game.teams.map((team) => team.abbreviation)));
}

function renderSummary(teams, playoffTeams) {
  const inPlayoffs = teams.filter((team) => playoffTeams.has(team.abbreviation)).length;
  const eastern = teams.filter((team) => team.conference === "Eastern").length;
  const western = teams.filter((team) => team.conference === "Western").length;
  const averageWins = teams.length ? (teams.reduce((sum, team) => sum + team.wins, 0) / teams.length).toFixed(1) : "0.0";

  const metrics = [
    { label: "Filtered teams", value: teams.length },
    { label: "Teams in current playoff scoreboard", value: inPlayoffs },
    { label: "Eastern / Western split", value: `${eastern} / ${western}` },
    { label: "Average wins", value: averageWins }
  ];

  elements.summaryStats.innerHTML = metrics
    .map(
      (metric) => `
        <article class="stat-card">
          <div class="stat-number">${metric.value}</div>
          <div class="metric-label">${metric.label}</div>
        </article>
      `
    )
    .join("");
}

function renderGames() {
  if (!state.games.length) {
    elements.gamesGrid.innerHTML = elements.emptyStateTemplate.innerHTML;
    return;
  }

  elements.gamesGrid.innerHTML = state.games
    .map((game) => `
      <article class="game-card">
        <div class="game-topline">
          <span class="badge">${game.shortDetail || game.status}</span>
          <span class="team-subtext">${state.source}</span>
        </div>
        <h3>${game.name}</h3>
        <p class="team-subtext">${game.detail || "NBA postseason"}</p>
        <div class="series-line">
          <span>${game.seriesText}</span>
          <span>${game.odds?.details || game.status}</span>
        </div>
        ${game.teams
          .map(
            (team, index) => `
              <div class="team-row">
                <div class="team-label">
                  <span class="seed">${index + 1}</span>
                  <div>
                    <div class="team-name">${team.name}</div>
                    <div class="team-subtext">${team.abbreviation} - ${team.homeAway}</div>
                  </div>
                </div>
                <div class="score">${team.score}</div>
              </div>
            `
          )
          .join("")}
      </article>
    `)
    .join("");
}

function renderPredictionSection() {
  elements.predictionDashboard.innerHTML = renderPredictionDashboard(
    state.predictions,
    state.filters.targetConfidence
  );
}

function renderConferenceBoards(teams, playoffTeams) {
  const conferences = ["Eastern", "Western"];
  const boards = conferences.map((conference) => {
    const conferenceTeams = teams.filter((team) => team.conference === conference);

    if (!conferenceTeams.length) {
      return `
        <article class="conference-board">
          <h3>${conference} Conference</h3>
          ${elements.emptyStateTemplate.innerHTML}
        </article>
      `;
    }

    return `
      <article class="conference-board">
        <div class="game-topline">
          <div>
            <h3>${conference} Conference</h3>
            <p class="table-subtitle">${conferenceTeams.length} teams in current filter set</p>
          </div>
          <span class="badge">${conferenceTeams.filter((team) => playoffTeams.has(team.abbreviation)).length} playoff teams</span>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Record</th>
              <th>Win %</th>
              <th>Div</th>
              <th>Seed</th>
            </tr>
          </thead>
          <tbody>
            ${conferenceTeams
              .map(
                (team) => `
                  <tr class="${playoffTeams.has(team.abbreviation) ? "playoff-row" : ""}">
                    <td>
                      <strong>${team.abbreviation}</strong><br />
                      <span class="team-subtext">${team.name}</span>
                    </td>
                    <td>${team.wins}-${team.losses}</td>
                    <td>${formatPct(team.winPct)}</td>
                    <td>${team.division}</td>
                    <td>${team.seed || "--"}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </article>
    `;
  });

  elements.conferenceBoards.innerHTML = boards.join("");
}

function renderDivisionCards(teams, playoffTeams) {
  const grouped = teams.reduce((accumulator, team) => {
    if (!accumulator[team.division]) {
      accumulator[team.division] = [];
    }
    accumulator[team.division].push(team);
    return accumulator;
  }, {});

  const divisions = Object.keys(grouped).sort();

  if (!divisions.length) {
    elements.divisionCards.innerHTML = elements.emptyStateTemplate.innerHTML;
    return;
  }

  elements.divisionCards.innerHTML = divisions
    .map((division) => {
      const divisionTeams = grouped[division];
      const averagePct = divisionTeams.reduce((sum, team) => sum + team.winPct, 0) / divisionTeams.length;
      const playoffCount = divisionTeams.filter((team) => playoffTeams.has(team.abbreviation)).length;
      const conference = divisionTeams[0].conference;

      return `
        <article class="division-card">
          <div class="game-topline">
            <div>
              <h3>${division}</h3>
              <p class="table-subtitle">${conference} Conference</p>
            </div>
            <span class="badge">${playoffCount} in playoffs</span>
          </div>
          <div class="division-metrics">
            <div class="metric-stack">
              <strong>${formatPct(averagePct)}</strong>
              <span>Average win rate</span>
            </div>
            <div class="metric-stack">
              <strong>${Math.max(...divisionTeams.map((team) => team.wins))}</strong>
              <span>Top win total</span>
            </div>
          </div>
          <div class="mini-list">
            ${divisionTeams
              .slice(0, 4)
              .map(
                (team) => `
                  <div class="mini-team">
                    <span>${team.abbreviation} - ${team.seed || "--"}</span>
                    <strong>${team.wins}-${team.losses}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTeamCards(teams, playoffTeams) {
  if (!teams.length) {
    elements.teamCards.innerHTML = elements.emptyStateTemplate.innerHTML;
    return;
  }

  elements.teamCards.innerHTML = teams
    .map(
      (team) => `
        <article class="team-card">
          <header>
            <div>
              <span class="badge">${team.conference}</span>
              <h3>${team.name}</h3>
            </div>
            <div class="seed">${team.seed || "--"}</div>
          </header>
          <p class="team-meta">${team.abbreviation} - ${team.division}</p>
          <div class="record">${team.wins}-${team.losses}</div>
          <p class="team-meta">Win rate ${formatPct(team.winPct)} - ${team.gamesBehind || "0"} GB</p>
          <footer>
            <span class="trend">${team.streak}</span>
            <span class="team-subtext">${playoffTeams.has(team.abbreviation) ? "Active in playoffs" : "Not on current playoff board"}</span>
          </footer>
        </article>
      `
    )
    .join("");
}

function render() {
  const filteredTeams = getFilteredTeams();
  const playoffTeams = getPlayoffTeamSet();
  renderSummary(filteredTeams, playoffTeams);
  renderGames();
  renderPredictionSection();
  renderConferenceBoards(filteredTeams, playoffTeams);
  renderDivisionCards(filteredTeams, playoffTeams);
  renderTeamCards(filteredTeams, playoffTeams);
}

elements.search.addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  render();
});

elements.conference.addEventListener("change", (event) => {
  state.filters.conference = event.target.value;
  render();
});

elements.division.addEventListener("change", (event) => {
  state.filters.division = event.target.value;
  render();
});

elements.sortBy.addEventListener("change", (event) => {
  state.filters.sortBy = event.target.value;
  render();
});

elements.predictionDashboard.addEventListener("change", (event) => {
  if (event.target.id === "targetConfidenceFilter") {
    state.filters.targetConfidence = Number(event.target.value);
    renderPredictionSection();
  }
});

elements.refreshButton.addEventListener("click", () => {
  loadData();
});

loadData();
