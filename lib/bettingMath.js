export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return 0;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function americanOddsToImpliedProbability(odds) {
  const numericOdds = Number(odds);
  if (!Number.isFinite(numericOdds) || numericOdds === 0) {
    return null;
  }

  if (numericOdds > 0) {
    return 100 / (numericOdds + 100);
  }

  return Math.abs(numericOdds) / (Math.abs(numericOdds) + 100);
}

export function parseOddsNumber(odds) {
  if (typeof odds === "number") {
    return odds;
  }

  if (typeof odds !== "string") {
    return null;
  }

  const cleaned = odds.replace(/[^0-9+-]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseSpreadNumber(line) {
  if (typeof line === "number") {
    return line;
  }

  if (typeof line !== "string") {
    return null;
  }

  const numeric = Number(line.replace(/[^\d+.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseTotalNumber(line) {
  if (typeof line === "number") {
    return line;
  }

  if (typeof line !== "string") {
    return null;
  }

  const numeric = Number(line.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseRecordSummary(summary) {
  if (!summary || typeof summary !== "string") {
    return { wins: 0, losses: 0, pct: 0 };
  }

  const match = summary.match(/(\d+)-(\d+)/);
  if (!match) {
    return { wins: 0, losses: 0, pct: 0 };
  }

  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const total = wins + losses;

  return {
    wins,
    losses,
    pct: total ? wins / total : 0
  };
}

export function parseStreakValue(streakDisplay) {
  if (!streakDisplay || typeof streakDisplay !== "string") {
    return 0;
  }

  const match = streakDisplay.match(/^([WL])(\d+)$/i);
  if (!match) {
    return 0;
  }

  const direction = match[1].toUpperCase() === "W" ? 1 : -1;
  return direction * Number(match[2]);
}

export function logisticProbability(margin, scale = 6.5) {
  return 1 / (1 + Math.exp(-margin / scale));
}

export function toPercent(value) {
  return `${roundTo(value * 100, 1)}%`;
}

export function confidenceBand(confidence) {
  if (confidence >= 90) {
    return "Extreme edge, very rare";
  }
  if (confidence >= 80) {
    return "Very strong, rare";
  }
  if (confidence >= 70) {
    return "Strong lean";
  }
  if (confidence >= 60) {
    return "Playable lean";
  }
  if (confidence >= 50) {
    return "Slight lean";
  }
  return "Pass / No bet";
}
