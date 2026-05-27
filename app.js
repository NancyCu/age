const state = {
  adminAuthenticated: false
};

const elements = {
  adminClearButton: document.querySelector("#adminClearButton"),
  adminAccumulatedAge: document.querySelector("#adminAccumulatedAge"),
  adminDashboard: document.querySelector("#adminDashboard"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminLoginPanel: document.querySelector("#adminLoginPanel"),
  adminLogoutButton: document.querySelector("#adminLogoutButton"),
  countAdults: document.querySelector("#countAdults"),
  countBeyondSeniors: document.querySelector("#countBeyondSeniors"),
  countMinors: document.querySelector("#countMinors"),
  countSeniors: document.querySelector("#countSeniors"),
  countYoungAdults: document.querySelector("#countYoungAdults"),
  guessAvailableNamesTableBody: document.querySelector("#guessAvailableNamesTableBody"),
  guessForm: document.querySelector("#guessForm"),
  guessesTableBody: document.querySelector("#guessesTableBody"),
  nearestGuessMeta: document.querySelector("#nearestGuessMeta"),
  nearestGuessName: document.querySelector("#nearestGuessName"),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  userForm: document.querySelector("#userForm"),
  userNamesTableBody: document.querySelector("#userNamesTableBody"),
  usersTableBody: document.querySelector("#usersTableBody")
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

function renderTable(tableBody, rows, valueKey) {
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
      return `
        <tr>
          <td>${row.name}</td>
          <td>${row[valueKey]}</td>
        </tr>
      `;
    })
    .join("");
}

function renderNearestGuess(nearestGuess) {
  if (!nearestGuess) {
    elements.nearestGuessName.textContent = "No winner yet";
    elements.nearestGuessMeta.textContent = "Waiting for guesses.";
    return;
  }

  elements.nearestGuessName.textContent = nearestGuess.name;
  elements.nearestGuessMeta.textContent = `Estimate ${nearestGuess.estimatedTotalAge}, difference ${nearestGuess.difference}`;
}

function renderSummary(summary) {
  const counts = summary.ageClassifications || {};
  const availableGuessNames = summary.availableGuessNames || [];
  const userNames = summary.userNames || [];

  elements.countMinors.textContent = String(counts.minors ?? 0);
  elements.countYoungAdults.textContent = String(counts.youngAdults ?? 0);
  elements.countAdults.textContent = String(counts.adults ?? 0);
  elements.countSeniors.textContent = String(counts.seniors ?? 0);
  elements.countBeyondSeniors.textContent = String(counts.beyondSeniors ?? 0);
  renderSingleColumnTable(elements.userNamesTableBody, userNames, "No age entries yet.");
  renderSingleColumnTable(elements.guessAvailableNamesTableBody, availableGuessNames, "No available first names yet.");
}

function renderSingleColumnTable(tableBody, names, emptyMessage) {
  if (!names.length) {
    tableBody.innerHTML = `
      <tr>
        <td class="empty-row">${emptyMessage}</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = names
    .map((name) => {
      return `
        <tr>
          <td>${name}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAdminDashboard(dashboard) {
  elements.adminAccumulatedAge.textContent = String(dashboard.accumulatedAge ?? 0);
  renderNearestGuess(dashboard.nearestGuess ?? null);
  renderTable(elements.usersTableBody, dashboard.users || [], "age");
  renderTable(elements.guessesTableBody, dashboard.guesses || [], "estimatedTotalAge");
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
  button.addEventListener("click", () => {
    activateTab(button.dataset.tabTarget);
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
