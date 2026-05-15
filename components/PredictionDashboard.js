import { renderPredictionCard } from "./PredictionCard.js";
import { renderPredictionFilters } from "./PredictionFilters.js";

function renderPredictionSummary(predictions, visiblePredictions, targetConfidence) {
  const averageConfidence = visiblePredictions.length
    ? (visiblePredictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / visiblePredictions.length).toFixed(1)
    : "0.0";
  const passCount = predictions.filter((prediction) => prediction.recommendation === "Pass").length;

  return `
    <div class="prediction-summary-grid">
      <article class="prediction-summary-card">
        <div class="stat-number">${predictions.length}</div>
        <div class="metric-label">Upcoming games modeled</div>
      </article>
      <article class="prediction-summary-card">
        <div class="stat-number">${visiblePredictions.length}</div>
        <div class="metric-label">Games at ${targetConfidence}%+</div>
      </article>
      <article class="prediction-summary-card">
        <div class="stat-number">${averageConfidence}</div>
        <div class="metric-label">Average shown confidence</div>
      </article>
      <article class="prediction-summary-card">
        <div class="stat-number">${passCount}</div>
        <div class="metric-label">Pass recommendations</div>
      </article>
    </div>
  `;
}

function renderEmptyPredictionState(targetConfidence, hasUpcomingGames) {
  if (!hasUpcomingGames) {
    return `
      <div class="empty-state">
        <h3>No upcoming games to model yet</h3>
        <p>The prediction engine activates when the scoreboard has scheduled NBA games.</p>
      </div>
    `;
  }

  if (targetConfidence === 95) {
    return `
      <div class="empty-state">
        <h3>No 95% edges found</h3>
        <p>Passing is part of winning.</p>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <h3>No ${targetConfidence}% edges found right now</h3>
      <p>The model prefers patience over forcing a pick.</p>
    </div>
  `;
}

export function renderPredictionDashboard(predictions, targetConfidence) {
  const visiblePredictions = predictions.filter((prediction) => prediction.confidence >= targetConfidence);
  const cards =
    visiblePredictions.length > 0
      ? visiblePredictions.map((prediction) => renderPredictionCard(prediction)).join("")
      : renderEmptyPredictionState(targetConfidence, predictions.length > 0);

  return `
    ${renderPredictionFilters(targetConfidence)}
    ${renderPredictionSummary(predictions, visiblePredictions, targetConfidence)}
    <div class="prediction-grid">
      ${cards}
    </div>
  `;
}
