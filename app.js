const elements = {
  ageInput: document.querySelector("#userAge"),
  form: document.querySelector("#userForm"),
  keypad: document.querySelector(".checkin-keypad"),
  nameInput: document.querySelector("#userName"),
  saveButton: document.querySelector("#saveAgeButton"),
  status: document.querySelector("#checkinStatus")
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

function setSubmitting(isSubmitting) {
  elements.saveButton.disabled = isSubmitting;
  elements.saveButton.textContent = isSubmitting ? "Saving..." : "Save My Age";
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
  if (!elements.ageInput.value) {
    setStatus("Enter your age first.", "warning");
    return;
  }

  elements.saveButton.focus();
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

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = elements.nameInput.value.trim();
  const age = getAgeValue();

  if (!name) {
    setStatus("Enter your name.", "warning");
    elements.nameInput.focus();
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

    elements.form.reset();
    setStatus("You are checked in. Thank you.", "success");
  } catch (error) {
    setStatus(error.message, "warning");
  } finally {
    setSubmitting(false);
  }
});
