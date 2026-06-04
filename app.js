const state = {
  adminAuthenticated: false,
  guessEnabled: true,
  winnerMode: "hidden"
};

const elements = {
  adminClearButton: document.querySelector("#adminClearButton"),
  adminAccumulatedAge: document.querySelector("#adminAccumulatedAge"),
  adminDashboard: document.querySelector("#adminDashboard"),
  adminGuessesTableBody: document.querySelector("#adminGuessesTableBody"),
  adminGuessToggleButton: document.querySelector("#adminGuessToggleButton"),
  adminHideWinnerButton: document.querySelector("#adminHideWinnerButton"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminLoginPanel: document.querySelector("#adminLoginPanel"),
  adminLogoutButton: document.querySelector("#adminLogoutButton"),
  adminMaskWinnerButton: document.querySelector("#adminMaskWinnerButton"),
  adminRevealWinnerButton: document.querySelector("#adminRevealWinnerButton"),
  adminUsersTableBody: document.querySelector("#adminUsersTableBody"),
  birthDay: document.querySelector("#birthDay"),
  birthMonth: document.querySelector("#birthMonth"),
  birthYear: document.querySelector("#birthYear"),
  birthdayPreview: document.querySelector("#birthdayPreview"),
  countAdults: document.querySelector("#countAdults"),
  countBeyondSeniors: document.querySelector("#countBeyondSeniors"),
  countMinors: document.querySelector("#countMinors"),
  countSeniors: document.querySelector("#countSeniors"),
  countYoungAdults: document.querySelector("#countYoungAdults"),
  guessAvailableNamesList: document.querySelector("#guessAvailableNamesList"),
  guessForm: document.querySelector("#guessForm"),
  guestQrImage: document.querySelector("#guestQrImage"),
  guestQrLink: document.querySelector("#guestQrLink"),
  guessSubmittedNamesList: document.querySelector("#guessSubmittedNamesList"),
  nearestGuessMeta: document.querySelector("#nearestGuessMeta"),
  nearestGuessName: document.querySelector("#nearestGuessName"),
  guessTabButton: document.querySelector('[data-tab-target="guessTab"]'),
  tabButtons: document.querySelectorAll(".tab-button"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  userForm: document.querySelector("#userForm"),
  userNamesList: document.querySelector("#userNamesList")
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function getGuestToken() {
  const storageKey = "agePoolGuestToken";
  const existingToken = window.localStorage.getItem(storageKey);

  if (existingToken) {
    return existingToken;
  }

  const token = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(storageKey, token);
  return token;
}

const guestToken = getGuestToken();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderSelectOptions(select, options, placeholder) {
  select.innerHTML = [
    `<option value="">${placeholder}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
  ].join("");
}

function getDaysInMonth(year, month) {
  if (!year || !month) {
    return 31;
  }

  return new Date(Number(year), Number(month), 0).getDate();
}

function populateBirthdayPicker() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const years = Array.from({ length: 131 }, (_, index) => currentYear - index);

  renderSelectOptions(
    elements.birthMonth,
    monthNames.map((label, index) => ({ label, value: String(index + 1).padStart(2, "0") })),
    "Month"
  );
  renderSelectOptions(elements.birthYear, years.map((year) => ({ label: String(year), value: String(year) })), "Year");
  updateBirthDayOptions();
}

function updateBirthDayOptions() {
  const selectedDay = elements.birthDay.value;
  const dayCount = getDaysInMonth(elements.birthYear.value, elements.birthMonth.value);
  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return { label: day, value: day };
  });

  renderSelectOptions(elements.birthDay, days, "Day");

  if (selectedDay && Number(selectedDay) <= dayCount) {
    elements.birthDay.value = selectedDay;
  }
}

function getSelectedBirthDate() {
  if (!elements.birthMonth.value || !elements.birthDay.value || !elements.birthYear.value) {
    return "";
  }

  return `${elements.birthYear.value}-${elements.birthMonth.value}-${elements.birthDay.value}`;
}

function calculateSelectedAge() {
  const birthDate = getSelectedBirthDate();
  if (!birthDate) {
    return null;
  }

  const [year, month, day] = birthDate.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }

  return age;
}

function updateBirthdayPreview() {
  const age = calculateSelectedAge();

  if (age === null) {
    elements.birthdayPreview.textContent = "Pick your birthday to unlock Save age.";
    elements.birthdayPreview.classList.remove("is-ready", "is-warning");
    return;
  }

  if (age < 0 || age > 130) {
    elements.birthdayPreview.textContent = "That birthday is outside the game age range.";
    elements.birthdayPreview.classList.remove("is-ready");
    elements.birthdayPreview.classList.add("is-warning");
    return;
  }

  elements.birthdayPreview.textContent = `We will submit age ${age}. No one else sees your birthday.`;
  elements.birthdayPreview.classList.add("is-ready");
  elements.birthdayPreview.classList.remove("is-warning");
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
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(displayValue)}</td>
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
          <td>${escapeHtml(row.name)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderNearestGuess(dashboard) {
  const nearestGuess = dashboard.nearestGuess ?? null;
  const fakeWinnerName = dashboard.fakeWinnerName || "Teddy-Tami-Tili-Guchi-Damien";
  elements.nearestGuessName.classList.remove("is-real-winner", "is-fake-winner", "is-hidden-winner");
  elements.nearestGuessName.classList.add(`is-${state.winnerMode}-winner`);

  if (state.winnerMode === "fake") {
    elements.nearestGuessName.textContent = fakeWinnerName;
    elements.nearestGuessMeta.textContent = "Mask Winner is showing a decoy name.";
    return;
  }

  if (state.winnerMode === "hidden") {
    elements.nearestGuessName.textContent = "Ready for the reveal";
    elements.nearestGuessMeta.textContent = "Use Touch Down to reveal the real closest guess.";
    return;
  }

  if (!nearestGuess) {
    elements.nearestGuessName.textContent = "No winner yet";
    elements.nearestGuessMeta.textContent = "Waiting for guests to submit guesses.";
    return;
  }

  elements.nearestGuessName.textContent = nearestGuess.name;
  elements.nearestGuessMeta.textContent = `Guessed ${nearestGuess.estimatedTotalAge}. Difference: ${nearestGuess.difference}.`;
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
  if (typeof dashboard.winnerMode === "string") {
    state.winnerMode = dashboard.winnerMode;
  }

  elements.adminDashboard.dataset.winnerMode = state.winnerMode;
  elements.adminAccumulatedAge.textContent = String(dashboard.accumulatedAge ?? 0);
  elements.adminGuessToggleButton.textContent = state.guessEnabled ? "Disable Guess Tab" : "Enable Guess Tab";
  elements.adminRevealWinnerButton.classList.toggle("is-selected", state.winnerMode === "real");
  elements.adminMaskWinnerButton.classList.toggle("is-selected", state.winnerMode === "fake");
  elements.adminHideWinnerButton.classList.toggle("is-selected", state.winnerMode === "hidden");
  renderNearestGuess(dashboard);
  renderSingleColumnTable(elements.adminUsersTableBody, dashboard.users || [], "No entries yet.");
  renderAdminGuessesTable(dashboard.guesses || []);
  applyGuessTabState();
}

function renderAdminGuessesTable(guesses) {
  renderTable(elements.adminGuessesTableBody, guesses, "estimatedTotalAge");
}

function renderColoredNameList(container, names, emptyMessage) {
  if (!names.length) {
    container.textContent = emptyMessage;
    return;
  }

  container.innerHTML = names
    .map((name, index) => {
      const comma = index < names.length - 1 ? '<span class="name-comma">, </span>' : "";
      return `<span class="available-name-item available-name-item-${index % 2}">${escapeHtml(name)}</span>${comma}`;
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

async function setWinnerMode(winnerMode) {
  if (!state.adminAuthenticated) {
    return;
  }

  const result = await requestJson("/api/admin/winner-mode", {
    body: JSON.stringify({ winnerMode }),
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
    updateBirthDayOptions();
    updateBirthdayPreview();

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

async function refreshGuestQrLink() {
  if (!elements.guestQrLink || !elements.guestQrImage) {
    return;
  }

  try {
    const link = await requestJson("/api/guest-link");
    elements.guestQrLink.href = link.guestUrl;
    elements.guestQrLink.textContent = link.guestUrl;
    elements.guestQrImage.src = `${link.qrUrl}?t=${Date.now()}`;
  } catch {
    elements.guestQrLink.textContent = window.location.origin || "/guest";
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
  const birthDate = getSelectedBirthDate();

  if (!birthDate) {
    alert("Choose your birth month, day, and year.");
    return;
  }

  await submitForm(
    "/api/users",
    {
      birthDate,
      name: formData.get("name"),
      sourceToken: guestToken
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
      name: formData.get("name"),
      sourceToken: guestToken
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
    await setWinnerMode("real");
  } catch (error) {
    alert(error.message);
  }
});

elements.adminMaskWinnerButton.addEventListener("click", async () => {
  try {
    await setWinnerMode("fake");
  } catch (error) {
    alert(error.message);
  }
});

elements.adminHideWinnerButton.addEventListener("click", async () => {
  try {
    await setWinnerMode("hidden");
  } catch (error) {
    alert(error.message);
  }
});

async function initialize() {
  try {
    populateBirthdayPicker();
    updateBirthdayPreview();
    await refreshGuestQrLink();
    await refreshSummary();
    const session = await requestJson("/api/admin/session");
    setAdminView(Boolean(session.authenticated));
    await refreshAdminDashboard();
  } catch (error) {
    alert(error.message);
  }
}

elements.birthMonth.addEventListener("change", () => {
  updateBirthDayOptions();
  updateBirthdayPreview();
});
elements.birthDay.addEventListener("change", updateBirthdayPreview);
elements.birthYear.addEventListener("change", () => {
  updateBirthDayOptions();
  updateBirthdayPreview();
});

initialize();
