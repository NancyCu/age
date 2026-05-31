const state = {
  adminAuthenticated: false,
  guessEnabled: true,
  winnerRevealed: false
};

const elements = {
  adminClearButton: document.querySelector("#adminClearButton"),
  adminAccumulatedAge: document.querySelector("#adminAccumulatedAge"),
  adminDashboard: document.querySelector("#adminDashboard"),
  adminGuessesTableBody: document.querySelector("#adminGuessesTableBody"),
  adminGuessToggleButton: document.querySelector("#adminGuessToggleButton"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminLoginPanel: document.querySelector("#adminLoginPanel"),
  adminLogoutButton: document.querySelector("#adminLogoutButton"),
  adminRevealWinnerButton: document.querySelector("#adminRevealWinnerButton"),
  adminUsersTableBody: document.querySelector("#adminUsersTableBody"),
  countAdults: document.querySelector("#countAdults"),
  countBeyondSeniors: document.querySelector("#countBeyondSeniors"),
  countMinors: document.querySelector("#countMinors"),
  countSeniors: document.querySelector("#countSeniors"),
  countYoungAdults: document.querySelector("#countYoungAdults"),
  guessAvailableNamesList: document.querySelector("#guessAvailableNamesList"),
  guessForm: document.querySelector("#guessForm"),
  guessSubmittedNamesList: document.querySelector("#guessSubmittedNamesList"),
  nearestGuessMeta: document.querySelector("#nearestGuessMeta"),
  nearestGuessName: document.querySelector("#nearestGuessName"),
  guessTabButton: document.querySelector('[data-tab-target="guessTab"]'),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  userForm: document.querySelector("#userForm"),
  userNamesList: document.querySelector("#userNamesList")
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function activateTab(targetId) {
  if (targetId === "guessTab" && !state.guessEnabled) {
    return;
  }

  elements.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === targetId);
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === targetId);
  });
}

function setAdminView(authenticated) {
  state.adminAuthenticated = authenticated;
  elements.adminLoginPanel.classList.toggle("hidden", authenticated);
  elements.adminDashboard.classList.toggle("hidden", !authenticated);
}

function applyGuessTabState() {
  const disabled = !state.guessEnabled;

  elements.guessTabButton.classList.toggle("is-disabled", disabled);
  elements.guessTabButton.setAttribute("aria-disabled", String(disabled));
  elements.guessTabButton.disabled = disabled;
  elements.guessForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = disabled;
  });

  if (disabled && elements.guessTabButton.classList.contains("is-active")) {
    activateTab("userTab");
  }
}

function renderTable(tableBody, rows, valueKey, options = {}) {
  const { hiddenValue = null } = options;

  if (!rows.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="2" class="empty-row">No entries yet.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows
    .map((row) => {
      const displayValue = hiddenValue === null ? row[valueKey] : hiddenValue;
      return `
        <tr>
          <td>${row.name}</td>
          <td>${displayValue}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSingleColumnTable(tableBody, rows, emptyMessage) {
  if (!rows.length) {
    tableBody.innerHTML = `
      <tr>
        <td class="empty-row">${emptyMessage}</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows
    .map((row) => {
      return `
        <tr>
          <td>${row.name}</td>
        </tr>
      `;
    })
    .join("");
}

function renderNearestGuess(nearestGuess) {
  if (state.winnerRevealed) {
    elements.nearestGuessName.textContent = "Teddy-Tami-Tili-Guchi-Damien";
    elements.nearestGuessMeta.textContent = "Temporary winner is shown while Mask Winner is active.";
    return;
  }

  if (!nearestGuess) {
    elements.nearestGuessName.textContent = "No winner yet";
    elements.nearestGuessMeta.textContent = "Waiting for best guess";
    return;
  }

  elements.nearestGuessName.textContent = nearestGuess.name;
  elements.nearestGuessMeta.textContent = `Estimate ${nearestGuess.estimatedTotalAge}, difference ${nearestGuess.difference}`;
}

function renderSummary(summary) {
  const counts = summary.ageClassifications || {};
  const availableGuessNames = summary.availableGuessNames || [];
  const guessNames = summary.guessNames || [];
  state.guessEnabled = summary.guessEnabled !== false;
  const userNames = summary.userNames || [];

  elements.countMinors.textContent = String(counts.minors ?? 0);
  elements.countYoungAdults.textContent = String(counts.youngAdults ?? 0);
  elements.countAdults.textContent = String(counts.adults ?? 0);
  elements.countSeniors.textContent = String(counts.seniors ?? 0);
  elements.countBeyondSeniors.textContent = String(counts.beyondSeniors ?? 0);
  renderColoredNameList(elements.userNamesList, userNames, "No age entries yet.");
  renderColoredNameList(elements.guessAvailableNamesList, availableGuessNames, "No available names yet.");
  renderColoredNameList(elements.guessSubmittedNamesList, guessNames, "No guesses submitted yet.");
  applyGuessTabState();
}

function renderAdminDashboard(dashboard) {
  if (typeof dashboard.guessEnabled === "boolean") {
    state.guessEnabled = dashboard.guessEnabled;
  }
  if (typeof dashboard.winnerRevealed === "boolean") {
    state.winnerRevealed = dashboard.winnerRevealed;
  }

  elements.adminAccumulatedAge.textContent = state.winnerRevealed ? "Hidden" : String(dashboard.accumulatedAge ?? 0);
  elements.adminGuessToggleButton.textContent = state.guessEnabled ? "Disable Guess Tab" : "Enable Guess Tab";
  elements.adminRevealWinnerButton.textContent = state.winnerRevealed ? "Mask Winner" : "Touch Down";
  renderNearestGuess(dashboard.nearestGuess ?? null);
  renderSingleColumnTable(elements.adminUsersTableBody, dashboard.users || [], "No entries yet.");
  renderAdminGuessesTable(dashboard.guesses || []);
  applyGuessTabState();
}

function renderAdminGuessesTable(guesses) {
  const hiddenValue = state.winnerRevealed ? "Hidden" : null;
  renderTable(elements.adminGuessesTableBody, guesses, "estimatedTotalAge", { hiddenValue });
}

function renderColoredNameList(container, names, emptyMessage) {
  if (!names.length) {
    container.textContent = emptyMessage;
    return;
  }

  container.innerHTML = names
    .map((name, index) => {
      const comma = index < names.length - 1 ? '<span class="name-comma">, </span>' : "";
      return `<span class="available-name-item available-name-item-${index % 2}">${name}</span>${comma}`;
    })
    .join("");
}

async function refreshSummary() {
  const summary = await requestJson("/api/summary");
  renderSummary(summary);
}

async function refreshAdminDashboard() {
  if (!state.adminAuthenticated) {
    return;
  }

  const dashboard = await requestJson("/api/admin/dashboard");
  renderAdminDashboard(dashboard);
}

async function activateAdminMaskState() {
  if (!state.adminAuthenticated) {
    return;
  }

  const result = await requestJson("/api/admin/reveal-winner", {
    body: JSON.stringify({ winnerRevealed: true }),
    method: "POST"
  });
  renderSummary(result.summary || {});
  renderAdminDashboard(result.dashboard || {});
}

async function submitForm(url, payload, form) {
  try {
    const result = await requestJson(url, {
      body: JSON.stringify(payload),
      method: "POST"
    });

    form.reset();

    if (result.summary) {
      renderSummary(result.summary);
    } else {
      await refreshSummary();
    }

    await refreshAdminDashboard();
  } catch (error) {
    if (error.message === "Duplicated name. Try again.") {
      alert("Duplicated name. Try again.");
      return;
    }

    alert(error.message);
  }
}

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    activateTab(button.dataset.tabTarget);

    if (button.dataset.tabTarget === "adminTab") {
      try {
        await activateAdminMaskState();
      } catch (error) {
        alert(error.message);
      }
    }
  });
});

elements.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(elements.userForm);
  await submitForm(
    "/api/users",
    {
      age: Number(formData.get("age")),
      name: formData.get("name")
    },
    elements.userForm
  );
});

elements.guessForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(elements.guessForm);
  await submitForm(
    "/api/guesses",
    {
      estimatedTotalAge: Number(formData.get("estimatedTotalAge")),
      name: formData.get("name")
    },
    elements.guessForm
  );
});

elements.adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(elements.adminLoginForm);

  try {
    await requestJson("/api/admin/login", {
      body: JSON.stringify({ password: formData.get("password") }),
      method: "POST"
    });

    elements.adminLoginForm.reset();
    setAdminView(true);
    await refreshAdminDashboard();
  } catch (error) {
    alert(error.message);
  }
});

elements.adminLogoutButton.addEventListener("click", async () => {
  await requestJson("/api/admin/logout", { method: "POST" });
  setAdminView(false);
});

elements.adminClearButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear out all user and guess statistics?");

  if (!confirmed) {
    return;
  }

  try {
    const result = await requestJson("/api/admin/clear", { method: "POST" });
    renderSummary(result.summary || {});
    renderAdminDashboard(result.dashboard || {});
  } catch (error) {
    alert(error.message);
  }
});

elements.adminGuessToggleButton.addEventListener("click", async () => {
  try {
    const result = await requestJson("/api/admin/guess-tab", {
      body: JSON.stringify({ enabled: !state.guessEnabled }),
      method: "POST"
    });
    renderSummary(result.summary || {});
    renderAdminDashboard(result.dashboard || {});
  } catch (error) {
    alert(error.message);
  }
});

elements.adminRevealWinnerButton.addEventListener("click", async () => {
  try {
    const result = await requestJson("/api/admin/reveal-winner", {
      body: JSON.stringify({ winnerRevealed: !state.winnerRevealed }),
      method: "POST"
    });
    renderSummary(result.summary || {});
    renderAdminDashboard(result.dashboard || {});
  } catch (error) {
    alert(error.message);
  }
});

async function initialize() {
  try {
    await refreshSummary();
    const session = await requestJson("/api/admin/session");
    setAdminView(Boolean(session.authenticated));
    await refreshAdminDashboard();
  } catch (error) {
    alert(error.message);
  }
}

initialize();
