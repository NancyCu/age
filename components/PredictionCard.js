function renderPickRow(pick) {
  const edge =
    pick.edgePercent !== undefined && pick.edgePercent !== null
      ? `${(pick.edgePercent * 100).toFixed(1)}% edge`
      : pick.edgePoints !== undefined && pick.edgePoints !== null
        ? `${pick.edgePoints.toFixed(1)} pts edge`
        : "No edge";

  return `
    <div class="pick-row">
      <div>
        <p class="pick-market">${pick.market}</p>
        <h4>${pick.side}</h4>
        <p class="team-subtext">${pick.reason}</p>
      </div>
      <div class="pick-meta">
        <span class="pick-recommendation ${pick.recommendation.toLowerCase()}">${pick.recommendation}</span>
        <span class="pick-edge">${edge}</span>
      </div>
    </div>
  `;
}

export function renderPredictionCard(prediction) {
  return `
    <article class="prediction-card">
      <div class="prediction-card-top">
        <div>
          <p class="section-kicker">Betting edge analyzer</p>
          <h3>${prediction.matchup}</h3>
          <p class="team-subtext">${prediction.gameTime} · ${prediction.venue}</p>
        </div>
        <div class="prediction-badges">
          <span class="badge">${prediction.marketProvider}</span>
          <span class="signal-pill ${prediction.recommendation.toLowerCase()}">${prediction.recommendation}</span>
        </div>
      </div>

      <div class="prediction-hero-grid">
        <div class="prediction-hero-stat">
          <span class="metric-label">Predicted winner</span>
          <strong>${prediction.predictedWinner}</strong>
          <p class="team-subtext">Margin ${prediction.predictedMargin} · Win prob ${prediction.homeAbbreviation === prediction.predictedWinnerAbbreviation ? prediction.homeWinProbability : prediction.awayWinProbability}%</p>
        </div>
        <div class="prediction-hero-stat">
          <span class="metric-label">Confidence</span>
          <strong>${prediction.confidence}%</strong>
          <p class="team-subtext">${prediction.confidenceBand}</p>
        </div>
        <div class="prediction-hero-stat">
          <span class="metric-label">Model edge</span>
          <strong>${prediction.modelEdge}</strong>
          <p class="team-subtext">Risk level ${prediction.riskLevel}</p>
        </div>
      </div>

      <div class="pick-grid">
        ${renderPickRow(prediction.moneyline)}
        ${renderPickRow(prediction.spread)}
        ${renderPickRow(prediction.total)}
      </div>

      <div class="prediction-footer">
        <p>${prediction.explanation}</p>
        ${
          prediction.missingInputs.length
            ? `<p class="team-subtext">Data unavailable: ${prediction.missingInputs.join(" | ")}</p>`
            : ""
        }
      </div>
    </article>
  `;
}
