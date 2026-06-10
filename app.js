const elements = {
  ageInput: document.querySelector("#userAge"),
  form: document.querySelector("#userForm"),
  guessForm: document.querySelector("#guestGuessForm"),
  guessInput: document.querySelector("#guestTotalGuess"),
  guessKeypad: document.querySelector(".guess-keypad"),
  guessNameSelect: document.querySelector("#guestGuessName"),
  guessStatus: document.querySelector("#guestGuessStatus"),
  keypad: document.querySelector(".checkin-keypad"),
  marbleCanvas: document.querySelector("#marbleJarCanvas"),
  marbleClose: document.querySelector("#marbleJarClose"),
  marbleDialog: document.querySelector("#marbleJarDialog"),
  marbleEmpty: document.querySelector("#marbleJarEmpty"),
  marbleLegend: document.querySelector("#marbleLegend"),
  marbleMotionStatus: document.querySelector("#marbleMotionStatus"),
  nameInput: document.querySelector("#userName"),
  openMarbleButton: document.querySelector("#openMarbleJarButton"),
  saveButton: document.querySelector("#saveAgeButton"),
  saveGuessButton: document.querySelector("#saveGuessButton"),
  shakeMarbleButton: document.querySelector("#shakeMarbleJarButton"),
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
  latestSummary: null,
  summaryPollId: null
};

const marbleJar = {
  bodies: [],
  engine: null,
  fallbackFrame: null,
  fallbackMarbles: [],
  isFallback: false,
  isOpen: false,
  lastPointer: null,
  motionListening: false,
  render: null,
  runner: null,
  resizeObserver: null
};

const fallbackMarbleGroups = [
  { color: "#5cc8ff", count: 0, key: "minors", label: "Minors" },
  { color: "#7bd88f", count: 0, key: "youngAdults", label: "Young Adults" },
  { color: "#ffd166", count: 0, key: "adults", label: "Adults" },
  { color: "#f78c6b", count: 0, key: "seniors", label: "Seniors" },
  { color: "#c792ea", count: 0, key: "beyondSeniors", label: "Beyond Seniors" }
];

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
  state.latestSummary = summary;
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

  renderMarbleHint(summary);
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

function getMarbleGroups(summary = state.latestSummary || {}) {
  if (Array.isArray(summary.ageClassificationGroups)) {
    return summary.ageClassificationGroups;
  }

  const counts = summary.ageClassifications || {};
  return fallbackMarbleGroups.map((group) => ({
    ...group,
    count: Number(counts[group.key] || 0)
  }));
}

function getMarbleTotal(groups) {
  return groups.reduce((sum, group) => sum + Number(group.count || 0), 0);
}

function getMarbleInitial(label) {
  const words = String(label || "?").trim().split(/\s+/).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase()).join("").slice(0, 2) || "?";
}

function renderMarbleHint(summary = state.latestSummary || {}) {
  const groups = getMarbleGroups(summary);
  const total = getMarbleTotal(groups);

  elements.marbleEmpty.hidden = total > 0;
  elements.marbleLegend.innerHTML = groups
    .map((group) => {
      const count = Number(group.count || 0);
      return `
        <div class="marble-legend-row">
          <span class="marble-swatch" style="--marble-color: ${escapeHtml(group.color)}">${escapeHtml(getMarbleInitial(group.label))}</span>
          <span>${escapeHtml(group.label)}</span>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");

  if (marbleJar.isOpen) {
    resetMarbleScene();
  }
}

function openMarbleJar() {
  elements.marbleDialog.hidden = false;
  marbleJar.isOpen = true;
  elements.marbleClose.focus();
  renderMarbleHint();
  startMarbleScene();
  startMarbleMotion();
}

function closeMarbleJar() {
  elements.marbleDialog.hidden = true;
  marbleJar.isOpen = false;
  stopMarbleScene();
  elements.openMarbleButton.focus();
}

function getMarbleCanvasSize() {
  const rect = elements.marbleCanvas.getBoundingClientRect();
  return {
    height: Math.max(260, Math.floor(rect.height || 360)),
    width: Math.max(220, Math.floor(rect.width || 320))
  };
}

function startMarbleScene() {
  if (!elements.marbleCanvas) {
    return;
  }

  if (window.Matter) {
    startMatterScene();
  } else {
    startFallbackScene();
  }

  if (!marbleJar.resizeObserver && window.ResizeObserver) {
    marbleJar.resizeObserver = new ResizeObserver(() => {
      if (marbleJar.isOpen) {
        resetMarbleScene();
      }
    });
    marbleJar.resizeObserver.observe(elements.marbleCanvas);
  }
}

function stopMarbleScene() {
  if (marbleJar.runner && window.Matter) {
    window.Matter.Runner.stop(marbleJar.runner);
  }

  if (marbleJar.render && window.Matter) {
    window.Matter.Render.stop(marbleJar.render);
    marbleJar.render.canvas.getContext("2d").clearRect(0, 0, marbleJar.render.canvas.width, marbleJar.render.canvas.height);
  }

  if (marbleJar.fallbackFrame) {
    window.cancelAnimationFrame(marbleJar.fallbackFrame);
  }

  marbleJar.bodies = [];
  marbleJar.engine = null;
  marbleJar.fallbackFrame = null;
  marbleJar.fallbackMarbles = [];
  marbleJar.isFallback = false;
  marbleJar.render = null;
  marbleJar.runner = null;
}

function resetMarbleScene() {
  if (!marbleJar.isOpen) {
    return;
  }

  stopMarbleScene();
  startMarbleScene();
}

function startMatterScene() {
  const Matter = window.Matter;
  const { height, width } = getMarbleCanvasSize();

  marbleJar.isFallback = false;
  elements.marbleCanvas.width = width;
  elements.marbleCanvas.height = height;

  const engine = Matter.Engine.create();
  engine.gravity.y = 0.9;
  const render = Matter.Render.create({
    canvas: elements.marbleCanvas,
    engine,
    options: {
      background: "transparent",
      height,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      showAngleIndicator: false,
      wireframes: false,
      width
    }
  });
  const runner = Matter.Runner.create();

  marbleJar.engine = engine;
  marbleJar.render = render;
  marbleJar.runner = runner;
  Matter.World.add(engine.world, buildMatterWalls(width, height));
  Matter.World.add(engine.world, buildMatterMarbles(width, height));
  Matter.Events.on(render, "afterRender", drawMatterMarbleLabels);
  Matter.Render.run(render);
  Matter.Runner.run(runner, engine);
}

function buildMatterWalls(width, height) {
  const Matter = window.Matter;
  const wall = 44;
  const wallStyle = { fillStyle: "rgba(255,255,255,0)", strokeStyle: "rgba(255,255,255,0)" };

  return [
    Matter.Bodies.rectangle(width / 2, height + wall / 2 - 16, width, wall, { isStatic: true, render: wallStyle }),
    Matter.Bodies.rectangle(width * 0.13, height / 2 + 28, wall, height * 0.88, { angle: -0.08, isStatic: true, render: wallStyle }),
    Matter.Bodies.rectangle(width * 0.87, height / 2 + 28, wall, height * 0.88, { angle: 0.08, isStatic: true, render: wallStyle }),
    Matter.Bodies.rectangle(width / 2, -wall / 2 + 8, width, wall, { isStatic: true, render: wallStyle })
  ];
}

function buildMatterMarbles(width, height) {
  const Matter = window.Matter;
  const groups = getMarbleGroups();
  const total = Math.max(1, getMarbleTotal(groups));
  const radius = Math.max(15, Math.min(32, Math.sqrt((width * height * 0.18) / (Math.PI * total))));
  const columns = Math.max(3, Math.min(7, Math.floor((width * 0.62) / (radius * 1.25))));
  const spacing = radius * 1.36;
  const startX = width / 2 - ((columns - 1) * spacing) / 2;
  const marbles = [];
  let index = 0;

  groups.forEach((group) => {
    for (let count = 0; count < Number(group.count || 0); count += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * spacing + Math.random() * radius * 0.22;
      const y = height * 0.2 + row * radius * 1.48 + Math.random() * radius * 0.35;
      const body = Matter.Bodies.circle(x, y, radius, {
        friction: 0.04,
        frictionAir: 0.018,
        restitution: 0.72,
        render: {
          fillStyle: group.color,
          lineWidth: 2,
          strokeStyle: "rgba(255, 255, 255, 0.72)"
        }
      });
      body.marbleLabel = getMarbleInitial(group.label);
      marbles.push(body);
      index += 1;
    }
  });

  marbleJar.bodies = marbles;
  return marbles;
}

function drawMatterMarbleLabels() {
  if (!marbleJar.render) {
    return;
  }

  const context = marbleJar.render.context;
  context.save();
  context.font = "900 13px Manrope, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(35, 23, 16, 0.78)";
  marbleJar.bodies.forEach((body) => {
    context.fillText(body.marbleLabel || "", body.position.x, body.position.y + 1);
  });
  context.restore();
}

function startFallbackScene() {
  const { height, width } = getMarbleCanvasSize();
  const context = elements.marbleCanvas.getContext("2d");
  const groups = getMarbleGroups();
  const total = Math.max(1, getMarbleTotal(groups));
  const radius = Math.max(15, Math.min(32, Math.sqrt((width * height * 0.18) / (Math.PI * total))));

  marbleJar.isFallback = true;
  elements.marbleCanvas.width = width;
  elements.marbleCanvas.height = height;
  elements.marbleMotionStatus.textContent = "Physics library unavailable. Drag or tap Shake for a lighter jar animation.";
  marbleJar.fallbackMarbles = [];

  groups.forEach((group) => {
    for (let count = 0; count < Number(group.count || 0); count += 1) {
      marbleJar.fallbackMarbles.push({
        color: group.color,
        label: getMarbleInitial(group.label),
        radius,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 1.5,
        x: width * (0.28 + Math.random() * 0.44),
        y: height * (0.2 + Math.random() * 0.22)
      });
    }
  });

  function tick() {
    context.clearRect(0, 0, width, height);
    marbleJar.fallbackMarbles.forEach((marble) => {
      marble.vy += 0.18;
      marble.vx *= 0.992;
      marble.vy *= 0.992;
      marble.x += marble.vx;
      marble.y += marble.vy;

      const left = width * 0.18 + marble.radius;
      const right = width * 0.82 - marble.radius;
      const bottom = height - marble.radius - 20;

      if (marble.x < left || marble.x > right) {
        marble.x = Math.max(left, Math.min(right, marble.x));
        marble.vx *= -0.72;
      }

      if (marble.y > bottom) {
        marble.y = bottom;
        marble.vy *= -0.58;
      }

      context.beginPath();
      context.arc(marble.x, marble.y, marble.radius, 0, Math.PI * 2);
      context.fillStyle = marble.color;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "rgba(255, 255, 255, 0.72)";
      context.stroke();
      context.fillStyle = "rgba(35, 23, 16, 0.78)";
      context.font = "900 13px Manrope, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(marble.label, marble.x, marble.y + 1);
    });
    marbleJar.fallbackFrame = window.requestAnimationFrame(tick);
  }

  tick();
}

function shakeMarbleJar() {
  if (marbleJar.isFallback) {
    marbleJar.fallbackMarbles.forEach((marble) => {
      marble.vx += (Math.random() - 0.5) * 9;
      marble.vy -= 7 + Math.random() * 5;
    });
    return;
  }

  if (!window.Matter || !marbleJar.bodies.length) {
    return;
  }

  marbleJar.bodies.forEach((body) => {
    window.Matter.Body.applyForce(body, body.position, {
      x: (Math.random() - 0.5) * 0.035,
      y: -0.04 - Math.random() * 0.025
    });
  });
}

function pushMarbles(deltaX, deltaY) {
  if (marbleJar.isFallback) {
    marbleJar.fallbackMarbles.forEach((marble) => {
      marble.vx += deltaX * 0.08;
      marble.vy += deltaY * 0.08;
    });
    return;
  }

  if (!window.Matter) {
    return;
  }

  marbleJar.bodies.forEach((body) => {
    window.Matter.Body.applyForce(body, body.position, {
      x: deltaX * 0.0008,
      y: deltaY * 0.0008
    });
  });
}

function startMarbleMotion() {
  if (marbleJar.motionListening) {
    return;
  }

  const enableMotion = () => {
    window.addEventListener("deviceorientation", handleDeviceTilt);
    marbleJar.motionListening = true;
    elements.marbleMotionStatus.textContent = "Drag, shake, or tilt your phone to move the marbles.";
  };

  if (window.DeviceOrientationEvent?.requestPermission) {
    window.DeviceOrientationEvent.requestPermission()
      .then((permission) => {
        if (permission === "granted") {
          enableMotion();
        } else {
          elements.marbleMotionStatus.textContent = "Drag the jar or tap Shake to move the marbles.";
        }
      })
      .catch(() => {
        elements.marbleMotionStatus.textContent = "Drag the jar or tap Shake to move the marbles.";
      });
    return;
  }

  enableMotion();
}

function handleDeviceTilt(event) {
  if (!marbleJar.isOpen || !marbleJar.engine || marbleJar.isFallback) {
    return;
  }

  const gamma = Number(event.gamma || 0);
  const beta = Number(event.beta || 0);
  marbleJar.engine.gravity.x = Math.max(-0.8, Math.min(0.8, gamma / 45));
  marbleJar.engine.gravity.y = Math.max(0.35, Math.min(1.25, 0.85 + beta / 120));
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

elements.openMarbleButton.addEventListener("click", openMarbleJar);
elements.marbleClose.addEventListener("click", closeMarbleJar);
elements.shakeMarbleButton.addEventListener("click", shakeMarbleJar);

elements.marbleDialog.addEventListener("click", (event) => {
  if (event.target === elements.marbleDialog) {
    closeMarbleJar();
  }
});

elements.marbleCanvas.addEventListener("pointerdown", (event) => {
  marbleJar.lastPointer = { x: event.clientX, y: event.clientY };
  elements.marbleCanvas.setPointerCapture(event.pointerId);
});

elements.marbleCanvas.addEventListener("pointermove", (event) => {
  if (!marbleJar.lastPointer) {
    return;
  }

  const deltaX = event.clientX - marbleJar.lastPointer.x;
  const deltaY = event.clientY - marbleJar.lastPointer.y;
  marbleJar.lastPointer = { x: event.clientX, y: event.clientY };
  pushMarbles(deltaX, deltaY);
});

elements.marbleCanvas.addEventListener("pointerup", () => {
  marbleJar.lastPointer = null;
});

elements.marbleCanvas.addEventListener("pointercancel", () => {
  marbleJar.lastPointer = null;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.successDialog.hidden) {
    hideCheckinSuccess();
  }

  if (event.key === "Escape" && !elements.marbleDialog.hidden) {
    closeMarbleJar();
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
