import {
  americanOddsToImpliedProbability,
  average,
  clamp,
  confidenceBand,
  logisticProbability,
  parseOddsNumber,
  parseSpreadNumber,
  parseTotalNumber,
  roundTo
} from "./bettingMath.js";

const FACTOR_WEIGHTS = {
  strength: 20,
  recent: 20,
  homeCourt: 10,
  rest: 10,
  pointDiff: 15,
  matchup: 10,
  injuries: 10,
  market: 5
};

function makeFactor(key, score, available, reason) {
  return {
    key,
    weight: FACTOR_WEIGHTS[key],
    score: available ? clamp(score, -1, 1) : 0,
    available,
    reason
  };
}

function getTeamContext(team, standingsMap) {
  return standingsMap.get(team.abbreviation) || null;
}

function getRecentPower(team) {
  if (!team) {
    return null;
  }

  const pieces = [];

  if (Number.isFinite(team.lastTenPct)) {
    pieces.push((team.lastTenPct - 0.5) * 2);
  }

  if (Number.isFinite(team.streakValue)) {
    pieces.push(clamp(team.streakValue / 6, -1, 1));
  }

  return pieces.length ? average(pieces) : null;
}

function getMarketSnapshot(game) {
  const homeSpread = parseSpreadNumber(game.odds?.spread?.homeLine);
  const awaySpread = parseSpreadNumber(game.odds?.spread?.awayLine);
  const totalLine = parseTotalNumber(game.odds?.total?.line);
  const homeMoneyline = parseOddsNumber(game.odds?.moneyline?.homeOdds);
  const awayMoneyline = parseOddsNumber(game.odds?.moneyline?.awayOdds);

  return {
    homeSpread,
    awaySpread,
    totalLine,
    homeMoneyline,
    awayMoneyline,
    hasAnyMarket:
      Number.isFinite(homeSpread) ||
      Number.isFinite(awaySpread) ||
      Number.isFinite(totalLine) ||
      Number.isFinite(homeMoneyline) ||
      Number.isFinite(awayMoneyline)
  };
}

function buildFactors(homeTeam, awayTeam, market) {
  const homeRecent = getRecentPower(homeTeam);
  const awayRecent = getRecentPower(awayTeam);
  const strengthFactor = makeFactor(
    "strength",
    (homeTeam.winPct ?? 0) - (awayTeam.winPct ?? 0),
    Number.isFinite(homeTeam.winPct) && Number.isFinite(awayTeam.winPct),
    "Team strength from overall record and win percentage."
  );

  const recentFactor = makeFactor(
    "recent",
    (homeRecent ?? 0) - (awayRecent ?? 0),
    homeRecent !== null && awayRecent !== null,
    "Recent form from last ten games and active streak."
  );

  const homeCourtFactor = makeFactor(
    "homeCourt",
    ((homeTeam.homeWinPct ?? 0.5) - (awayTeam.roadWinPct ?? 0.5)) + 0.16,
    Number.isFinite(homeTeam.homeWinPct) && Number.isFinite(awayTeam.roadWinPct),
    "Home court advantage using home and road splits."
  );

  const restFactor = makeFactor(
    "rest",
    0,
    false,
    "Rest and back-to-back data unavailable from the current feed."
  );

  const pointDiffFactor = makeFactor(
    "pointDiff",
    ((homeTeam.avgPointDiff ?? 0) - (awayTeam.avgPointDiff ?? 0)) / 12,
    Number.isFinite(homeTeam.avgPointDiff) && Number.isFinite(awayTeam.avgPointDiff),
    "Point differential and season scoring margin."
  );

  const matchupSignal =
    ((homeTeam.avgPointsFor ?? 0) - (awayTeam.avgPointsAgainst ?? 0)) -
    ((awayTeam.avgPointsFor ?? 0) - (homeTeam.avgPointsAgainst ?? 0));

  const matchupFactor = makeFactor(
    "matchup",
    matchupSignal / 18,
    Number.isFinite(homeTeam.avgPointsFor) &&
      Number.isFinite(homeTeam.avgPointsAgainst) &&
      Number.isFinite(awayTeam.avgPointsFor) &&
      Number.isFinite(awayTeam.avgPointsAgainst),
    "Offensive and defensive matchup from scoring and allowance."
  );

  const injuryFactor = makeFactor(
    "injuries",
    0,
    false,
    "Injury inputs unavailable in the current feed, so confidence is capped."
  );

  const marketExpectedMargin = Number.isFinite(market.homeSpread) ? -market.homeSpread : 0;
  const marketFactor = makeFactor(
    "market",
    marketExpectedMargin / 12,
    market.hasAnyMarket,
    "Market consensus from moneyline, spread, and total pricing."
  );

  return [
    strengthFactor,
    recentFactor,
    homeCourtFactor,
    restFactor,
    pointDiffFactor,
    matchupFactor,
    injuryFactor,
    marketFactor
  ];
}

function computeModel(homeTeam, awayTeam, market, factors) {
  const availableWeight = factors.filter((factor) => factor.available).reduce((sum, factor) => sum + factor.weight, 0);
  const weightedScore = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const normalizedScore = availableWeight ? weightedScore / availableWeight : 0;

  const marketMargin = Number.isFinite(market.homeSpread) ? -market.homeSpread : 0;
  const baseMargin = normalizedScore * 13 + marketMargin * 0.2;
  const modelHomeMargin = clamp(baseMargin, -18, 18);
  const modelHomeWinProb = clamp(logisticProbability(modelHomeMargin), 0.05, 0.95);

  const baseTotal = average([
    (homeTeam.avgPointsFor ?? 110) + (awayTeam.avgPointsFor ?? 110),
    (homeTeam.avgPointsFor ?? 110) + (awayTeam.avgPointsAgainst ?? 110),
    (awayTeam.avgPointsFor ?? 110) + (homeTeam.avgPointsAgainst ?? 110)
  ]);

  const recentTotalBoost =
    (((homeTeam.lastTenPct ?? 0.5) - 0.5) + ((awayTeam.lastTenPct ?? 0.5) - 0.5)) * 8;
  const matchupTotalBoost = Math.abs((factors.find((factor) => factor.key === "matchup")?.score ?? 0) * 4);
  const marketTotal = Number.isFinite(market.totalLine) ? market.totalLine : null;

  const projectedTotal = clamp(
    baseTotal + recentTotalBoost + matchupTotalBoost + (marketTotal ? (marketTotal - baseTotal) * 0.08 : 0),
    188,
    248
  );

  return {
    availableWeight,
    normalizedScore,
    modelHomeMargin,
    modelHomeWinProb,
    projectedTotal
  };
}

function buildMoneylinePick(homeTeam, awayTeam, market, model) {
  const homeWins = model.modelHomeWinProb >= 0.5;
  const side = homeWins ? homeTeam : awayTeam;
  const sideProbability = homeWins ? model.modelHomeWinProb : 1 - model.modelHomeWinProb;
  const sideOdds = homeWins ? market.homeMoneyline : market.awayMoneyline;
  const impliedProbability = americanOddsToImpliedProbability(sideOdds);
  const edge = impliedProbability === null ? null : sideProbability - impliedProbability;

  let recommendation = "Pass";
  if (edge !== null && edge >= 0.05) {
    recommendation = edge >= 0.08 ? "Bet" : "Lean";
  }

  return {
    market: "Moneyline",
    side: `${side.abbreviation} ML`,
    recommendation,
    edgePercent: edge,
    confidenceSeed: clamp((edge ?? 0) * 180, 0, 18),
    impliedProbability,
    modelProbability: sideProbability,
    odds: sideOdds,
    reason:
      edge !== null && edge >= 0.05
        ? `Model probability is ${(edge * 100).toFixed(1)}% above the market's implied number.`
        : "Model edge does not clear the 5% value threshold."
  };
}

function buildSpreadPick(homeTeam, awayTeam, market, model) {
  const homeSpread = market.homeSpread;
  if (!Number.isFinite(homeSpread)) {
    return {
      market: "Spread",
      side: "Data unavailable",
      recommendation: "Pass",
      edgePoints: null,
      confidenceSeed: 0,
      reason: "Sportsbook spread was unavailable."
    };
  }

  const homeEdge = model.modelHomeMargin + homeSpread;
  const side = homeEdge >= 0 ? `${homeTeam.abbreviation} ${homeSpread > 0 ? `+${homeSpread}` : homeSpread}` : `${awayTeam.abbreviation} ${market.awaySpread > 0 ? `+${market.awaySpread}` : market.awaySpread}`;
  const edgePoints = Math.abs(homeEdge);
  let recommendation = "Pass";

  if (edgePoints >= 3) {
    recommendation = "Bet";
  } else if (edgePoints >= 1.5) {
    recommendation = "Lean";
  }

  return {
    market: "Spread",
    side,
    recommendation,
    edgePoints,
    confidenceSeed: clamp(edgePoints * 3.5, 0, 20),
    sportsbookLine: homeEdge >= 0 ? homeSpread : market.awaySpread,
    reason:
      recommendation === "Pass"
        ? "Model margin is too close to the market spread to force an ATS play."
        : `Model makes this line ${edgePoints.toFixed(1)} points away from the market spread.`
  };
}

function buildTotalPick(market, model) {
  if (!Number.isFinite(market.totalLine)) {
    return {
      market: "Total",
      side: "Data unavailable",
      recommendation: "Pass",
      edgePoints: null,
      confidenceSeed: 0,
      reason: "Sportsbook total was unavailable."
    };
  }

  const totalEdge = model.projectedTotal - market.totalLine;
  const edgePoints = Math.abs(totalEdge);
  const over = totalEdge >= 0;
  let recommendation = "Pass";

  if (edgePoints >= 5) {
    recommendation = "Bet";
  } else if (edgePoints >= 2.5) {
    recommendation = "Lean";
  }

  return {
    market: "Total",
    side: `${over ? "Over" : "Under"} ${market.totalLine}`,
    recommendation,
    edgePoints,
    confidenceSeed: clamp(edgePoints * 2.8, 0, 18),
    projectedTotal: model.projectedTotal,
    reason:
      recommendation === "Pass"
        ? "Projected total is inside the no-bet range versus the market number."
        : `Projected total differs from the line by ${edgePoints.toFixed(1)} points.`
  };
}

function computeConfidence({ factors, picks, marketAvailable, recentAvailable }) {
  const availableFactors = factors.filter((factor) => factor.available);
  const availableCount = availableFactors.length;
  const strongestPick = [...picks].sort((a, b) => (b.confidenceSeed ?? 0) - (a.confidenceSeed ?? 0))[0];
  const directionScore = strongestPick.side.startsWith("Under") || strongestPick.side.includes("away")
    ? -1
    : 1;
  const agreeingFactors = availableFactors.filter((factor) => Math.sign(factor.score || 0) === directionScore && Math.abs(factor.score) > 0.12).length;
  const dataCompleteness = availableCount / Object.keys(FACTOR_WEIGHTS).length;
  const recentConsistency = recentAvailable
    ? clamp(Math.abs((availableFactors.find((factor) => factor.key === "recent")?.score ?? 0)), 0, 1)
    : 0;
  const marketDisagreement = marketAvailable ? 0 : 1;

  let confidence = 50;
  confidence += strongestPick.confidenceSeed ?? 0;
  confidence += agreeingFactors * 2.4;
  confidence += dataCompleteness * 10;
  confidence += recentConsistency * 8;
  confidence -= marketDisagreement * 4;

  let cap = 92;
  if (!factors.find((factor) => factor.key === "injuries")?.available) {
    cap = Math.min(cap, 82);
  }
  if (!marketAvailable) {
    cap = Math.min(cap, 75);
  }
  if (!recentAvailable) {
    cap = Math.min(cap, 78);
  }
  if (availableCount < 5) {
    cap = Math.min(cap, 70);
  }

  const strongAgreement = agreeingFactors >= 7 && availableCount >= 7 && (strongestPick.confidenceSeed ?? 0) >= 18;
  if (!strongAgreement) {
    cap = Math.min(cap, 89);
  }

  return {
    confidence: roundTo(clamp(confidence, 50, cap), 1),
    cap,
    availableCount,
    dataCompleteness,
    band: confidenceBand(clamp(confidence, 50, cap))
  };
}

function getRiskLevel(recommendation, confidence, dataCompleteness) {
  if (recommendation === "Pass") {
    return "High";
  }
  if (confidence >= 72 && dataCompleteness >= 0.7) {
    return "Low";
  }
  return "Medium";
}

function buildExplanation(predictedWinner, homeTeam, awayTeam, primaryPick, model, factors, missingInputs) {
  const activeReasons = factors
    .filter((factor) => factor.available && Math.abs(factor.score) > 0.08)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map((factor) => factor.reason.toLowerCase());

  const missingNote = missingInputs.length
    ? ` ${missingInputs.join(", ")} marked as data unavailable, so confidence is capped.`
    : "";

  return `${predictedWinner.abbreviation} projects ${roundTo(Math.abs(model.modelHomeMargin), 1)} points better than ${
    predictedWinner.abbreviation === homeTeam.abbreviation ? awayTeam.abbreviation : homeTeam.abbreviation
  } based on ${activeReasons.join(", ")}. Best angle: ${primaryPick.side} (${primaryPick.market}).${missingNote}`;
}

export function buildPredictions(games, standings) {
  const standingsMap = new Map(standings.map((team) => [team.abbreviation, team]));

  return games
    .filter((game) => game.isUpcoming)
    .map((game) => {
      const homeEntry = game.teams.find((team) => team.homeAway === "home") || game.teams[0];
      const awayEntry = game.teams.find((team) => team.homeAway === "away") || game.teams[1];
      const homeTeam = getTeamContext(homeEntry, standingsMap);
      const awayTeam = getTeamContext(awayEntry, standingsMap);

      if (!homeTeam || !awayTeam) {
        return null;
      }

      const market = getMarketSnapshot(game);
      const factors = buildFactors(homeTeam, awayTeam, market);
      const model = computeModel(homeTeam, awayTeam, market, factors);
      const moneyline = buildMoneylinePick(homeTeam, awayTeam, market, model);
      const spread = buildSpreadPick(homeTeam, awayTeam, market, model);
      const total = buildTotalPick(market, model);
      const picks = [moneyline, spread, total];

      const rankedPicks = [...picks].sort((a, b) => {
        const recommendationRank = { Bet: 3, Lean: 2, Pass: 1 };
        return (recommendationRank[b.recommendation] || 0) - (recommendationRank[a.recommendation] || 0) || (b.confidenceSeed || 0) - (a.confidenceSeed || 0);
      });

      const primaryPick = rankedPicks[0];
      const recentAvailable = factors.some((factor) => factor.key === "recent" && factor.available);
      const confidence = computeConfidence({
        factors,
        picks,
        marketAvailable: market.hasAnyMarket,
        recentAvailable
      });

      const predictedWinner = model.modelHomeWinProb >= 0.5 ? homeTeam : awayTeam;
      const overallRecommendation =
        primaryPick.recommendation === "Pass"
          ? "Pass"
          : confidence.confidence >= 70 && primaryPick.recommendation === "Bet"
            ? "Bet"
            : "Lean";

      const missingInputs = factors.filter((factor) => !factor.available).map((factor) => factor.reason);
      const modelEdge =
        primaryPick.market === "Moneyline"
          ? `${roundTo((primaryPick.edgePercent || 0) * 100, 1)}%`
          : `${roundTo(primaryPick.edgePoints || 0, 1)} pts`;

      return {
        gameId: game.id,
        matchup: game.name,
        gameTime: game.shortDetail || game.status,
        venue: game.venue?.fullName || "Venue unavailable",
        predictedWinner: predictedWinner.name,
        predictedWinnerAbbreviation: predictedWinner.abbreviation,
        predictedMargin: roundTo(Math.abs(model.modelHomeMargin), 1),
        moneyline,
        spread,
        total,
        confidence: confidence.confidence,
        confidenceBand: confidence.band,
        modelEdge,
        riskLevel: getRiskLevel(overallRecommendation, confidence.confidence, confidence.dataCompleteness),
        recommendation: overallRecommendation,
        explanation: buildExplanation(predictedWinner, homeTeam, awayTeam, primaryPick, model, factors, missingInputs),
        missingInputs,
        primaryPick,
        projectedTotal: roundTo(model.projectedTotal, 1),
        homeTeam: homeTeam.name,
        awayTeam: awayTeam.name,
        homeAbbreviation: homeTeam.abbreviation,
        awayAbbreviation: awayTeam.abbreviation,
        homeWinProbability: roundTo(model.modelHomeWinProb * 100, 1),
        awayWinProbability: roundTo((1 - model.modelHomeWinProb) * 100, 1),
        marketProvider: game.odds?.provider || "Sportsbook line",
        factors
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const recommendationRank = { Bet: 3, Lean: 2, Pass: 1 };
      return (
        (recommendationRank[b.recommendation] || 0) - (recommendationRank[a.recommendation] || 0) ||
        b.confidence - a.confidence ||
        parseFloat(b.modelEdge) - parseFloat(a.modelEdge)
      );
    });
}
