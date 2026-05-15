export function renderPredictionFilters(targetConfidence) {
  const options = [60, 70, 80, 90, 95];

  return `
    <div class="prediction-filter-bar">
      <label class="control prediction-control">
        <span>Target confidence</span>
        <select id="targetConfidenceFilter">
          ${options
            .map(
              (option) => `
                <option value="${option}" ${option === targetConfidence ? "selected" : ""}>
                  ${option}%+
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      <p class="panel-caption prediction-disclaimer">
        Model caps confidence when key data is missing. No guarantees, only ranked leans.
      </p>
    </div>
  `;
}
