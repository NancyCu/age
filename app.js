const elements = {
  ageInput: document.querySelector("#userAge"),
  form: document.querySelector("#userForm"),
  guessForm: document.querySelector("#guestGuessForm"),
  guessInput: document.querySelector("#guestTotalGuess"),
  guessKeypad: document.querySelector(".guess-keypad"),
  guessNameSelect: document.querySelector("#guestGuessName"),
  guessStatus: document.querySelector("#guestGuessStatus"),
  keypad: document.querySelector(".checkin-keypad"),
  nameInput: document.querySelector("#userName"),
  saveButton: document.querySelector("#saveAgeButton"),
  saveGuessButton: document.querySelector("#saveGuessButton"),
  status: document.querySelector("#checkinStatus"),
  successClose: document.querySelector("#checkinSuccessClose"),
  successDialog: document.querySelector("#checkinSuccessDialog"),
  successMessage: document.querySelector("#checkinSuccessMessage"),
  tabs: document.querySelectorAll("[data-checkin-view]"),
  views: document.querySelectorAll(".checkin-view")
};

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
const checkedInNameStorageKey = "agePoolCheckedInName";
const state = {
  checkedInName: window.localStorage.getItem(checkedInNameStorageKey) || "",
  checkinSubmitting: false,
  guessEnabled: true,
  summaryPollId: null
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

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function setGuessStatus(message, tone = "neutral") {
  elements.guessStatus.textContent = message;
  elements.guessStatus.dataset.tone = tone;
}

function setSubmitting(isSubmitting) {
  state.checkinSubmitting = isSubmitting;
  elements.saveButton.disabled = isSubmitting;
  elements.saveButton.textContent = isSubmitting ? "Saving..." : "Save My Age";
}

function setGuessSubmitting(isSubmitting) {
  elements.saveGuessButton.disabled = isSubmitting || !state.guessEnabled;
  elements.saveGuessButton.textContent = isSubmitting ? "Saving..." : "Save Guess";
}

function activateView(viewId) {
  if (viewId === "guestsPanel" && !state.guessEnabled) {
    setGuessStatus("Make Guess is not open yet.", "warning");
    pulseElement(elements.tabs[1]);
    return;
  }

  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.checkinView === viewId);
    tab.classList.toggle("is-pulsing", tab.dataset.checkinView === viewId);
  });

  elements.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
}

function pulseElement(element) {
  if (!element) {
    return;
  }

  element.classList.remove("is-pulsing");
  void element.offsetWidth;
  element.classList.add("is-pulsing");
}

function getGuessTab() {
  return [...elements.tabs].find((tab) => tab.dataset.checkinView === "guestsPanel");
}

function updateGuessNameOptions(summary = {}) {
  const names = Array.isArray(summary.availableGuessNames) ? summary.availableGuessNames : [];
  const preferredName = state.checkedInName && names.includes(state.checkedInName) ? state.checkedInName : "";

  elements.guessNameSelect.innerHTML = [
    '<option value="">Choose your name</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");

  if (preferredName) {
    elements.guessNameSelect.value = preferredName;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSummary(summary = {}) {
  const wasEnabled = state.guessEnabled;
  state.guessEnabled = summary.guessEnabled !== false;
  const guessTab = getGuessTab();

  if (guessTab) {
    guessTab.setAttribute("aria-disabled", String(!state.guessEnabled));
    guessTab.classList.toggle("is-disabled", !state.guessEnabled);
    guessTab.classList.toggle("is-live-enabled", state.guessEnabled);
  }

  elements.saveGuessButton.disabled = !state.guessEnabled;
  elements.guessNameSelect.disabled = !state.guessEnabled;
  elements.guessInput.disabled = !state.guessEnabled;
  elements.guessKeypad.classList.toggle("is-disabled", !state.guessEnabled);
  updateGuessNameOptions(summary);

  if (!state.guessEnabled && document.querySelector("#guestsPanel").classList.contains("is-active")) {
    activateView("checkinPanel");
    setStatus("Make Guess is closed for now.", "warning");
  }

  if (wasEnabled !== state.guessEnabled) {
    pulseElement(guessTab);
  }
}

async function refreshSummary() {
  try {
    const summary = await requestJson("/api/summary");
    renderSummary(summary);
  } catch {
    // Summary refreshes should keep the form usable if the network blinks.
  }
}

function connectPublicEvents() {
  if (!window.EventSource) {
    state.summaryPollId = window.setInterval(refreshSummary, 2500);
    return;
  }

  const events = new EventSource("/api/events");

  events.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    renderSummary(payload.summary || {});
  };

  events.onerror = () => {
    if (!state.summaryPollId) {
      state.summaryPollId = window.setInterval(refreshSummary, 2500);
    }
  };
}

function getAgeValue() {
  return Number(elements.ageInput.value);
}

function appendAgeDigit(digit) {
  const currentValue = elements.ageInput.value;

  if (currentValue.length >= 3) {
    return;
  }

  const nextValue = `${currentValue}${digit}`.replace(/^0+(?=\d)/, "");
  const numericValue = Number(nextValue);

  if (Number.isInteger(numericValue) && numericValue <= 130) {
    elements.ageInput.value = nextValue;
    setStatus("");
  }
}

function deleteAgeDigit() {
  elements.ageInput.value = elements.ageInput.value.slice(0, -1);
  setStatus("");
}

function confirmAge() {
  if (typeof elements.form.requestSubmit === "function") {
    elements.form.requestSubmit();
  } else {
    elements.saveButton.click();
  }
}

function showCheckinSuccess(name) {
  elements.successMessage.textContent = `${name} is checked in.`;
  elements.successDialog.hidden = false;
  elements.successClose.focus();
}

function hideCheckinSuccess() {
  elements.successDialog.hidden = true;
}

elements.keypad.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  if (button.dataset.ageKey) {
    appendAgeDigit(button.dataset.ageKey);
    return;
  }

  if (button.dataset.ageAction === "backspace") {
    deleteAgeDigit();
    return;
  }

  if (button.dataset.ageAction === "confirm") {
    confirmAge();
  }
});

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    pulseElement(tab);
    activateView(tab.dataset.checkinView);
  });
});

elements.successClose.addEventListener("click", hideCheckinSuccess);

elements.successDialog.addEventListener("click", (event) => {
  if (event.target === elements.successDialog) {
    hideCheckinSuccess();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.successDialog.hidden) {
    hideCheckinSuccess();
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.checkinSubmitting) {
    return;
  }

  const name = elements.nameInput.value.trim();
  const age = getAgeValue();
  const hasAge = elements.ageInput.value.trim() !== "";

  if (!name && !hasAge) {
    setStatus("Enter your name and age before saving.", "warning");
    elements.nameInput.focus();
    return;
  }

  if (!name) {
    setStatus("Enter your name before saving.", "warning");
    elements.nameInput.focus();
    return;
  }

  if (!hasAge) {
    setStatus("Enter your age before saving.", "warning");
    return;
  }

  if (!Number.isInteger(age) || age < 0 || age > 130) {
    setStatus("Enter an age from 0 to 130.", "warning");
    return;
  }

  setSubmitting(true);
  setStatus("Saving your age...", "neutral");

  try {
    await requestJson("/api/users", {
      body: JSON.stringify({
        age,
        name,
        sourceToken: guestToken
      }),
      method: "POST"
    });

    state.checkedInName = name;
    window.localStorage.setItem(checkedInNameStorageKey, name);
    elements.form.reset();
    setStatus("You are checked in. Thank you.", "success");
    showCheckinSuccess(name);
    await refreshSummary();
  } catch (error) {
    setStatus(error.message, "warning");
  } finally {
    setSubmitting(false);
  }
});

function appendGuessDigit(digit) {
  const currentValue = elements.guessInput.value;

  if (currentValue.length >= 6) {
    return;
  }

  const nextValue = `${currentValue}${digit}`.replace(/^0+(?=\d)/, "");
  const numericValue = Number(nextValue);

  if (Number.isInteger(numericValue) && numericValue <= 130000) {
    elements.guessInput.value = nextValue;
    setGuessStatus("");
  }
}

function deleteGuessDigit() {
  elements.guessInput.value = elements.guessInput.value.slice(0, -1);
  setGuessStatus("");
}

function confirmGuess() {
  if (!elements.guessInput.value) {
    setGuessStatus("Enter your total guess first.", "warning");
    return;
  }

  elements.saveGuessButton.focus();
}

elements.guessKeypad.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button || !state.guessEnabled) {
    return;
  }

  if (button.dataset.guessKey) {
    appendGuessDigit(button.dataset.guessKey);
    return;
  }

  if (button.dataset.guessAction === "backspace") {
    deleteGuessDigit();
    return;
  }

  if (button.dataset.guessAction === "confirm") {
    confirmGuess();
  }
});

elements.guessForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(elements.guessForm);
  const name = String(formData.get("name") || "").trim();
  const estimatedTotalAge = Number(formData.get("estimatedTotalAge"));

  if (!name) {
    setGuessStatus("Choose the same name you used for check-in.", "warning");
    return;
  }

  if (!Number.isInteger(estimatedTotalAge) || estimatedTotalAge < 0 || estimatedTotalAge > 130000) {
    setGuessStatus("Enter a whole-number total guess.", "warning");
    return;
  }

  setGuessSubmitting(true);
  setGuessStatus("Saving your guess...", "neutral");

  try {
    await requestJson("/api/guesses", {
      body: JSON.stringify({
        estimatedTotalAge,
        name,
        sourceToken: guestToken
      }),
      method: "POST"
    });

    elements.guessForm.reset();
    setGuessStatus("Your guess is saved.", "success");
    await refreshSummary();
  } catch (error) {
    setGuessStatus(error.message, "warning");
  } finally {
    setGuessSubmitting(false);
  }
});

refreshSummary();
connectPublicEvents();
