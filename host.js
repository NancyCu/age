const hostState = {
  authenticated: false,
  eventSource: null,
  guessEnabled: true,
  winnerMode: "hidden"
};

const hostElements = {
  ageTotal: document.querySelector("#hostAgeTotal"),
  connectionStatus: document.querySelector("#hostConnectionStatus"),
  dashboard: document.querySelector("#hostDashboard"),
  guessNames: document.querySelector("#hostGuessNames"),
  guessToggleButton: document.querySelector("#hostGuessToggleButton"),
  guestQrImage: document.querySelector("#hostGuestQrImage"),
  guestQrLink: document.querySelector("#hostGuestQrLink"),
  lastUpdated: document.querySelector("#hostLastUpdated"),
  loginForm: document.querySelector("#hostLoginForm"),
  loginPanel: document.querySelector("#hostLoginPanel"),
  logoutButton: document.querySelector("#hostLogoutButton"),
  maskWinnerButton: document.querySelector("#hostMaskWinnerButton"),
  needGuessCount: document.querySelector("#hostNeedGuessCount"),
  needGuessNames: document.querySelector("#hostNeedGuessNames"),
  password: document.querySelector("#hostPassword"),
  posterGuestLink: document.querySelector("#hostPosterGuestLink"),
  posterQrImage: document.querySelector("#hostPosterQrImage"),
  printQrButton: document.querySelector("#hostPrintQrButton"),
  playerCount: document.querySelector("#hostPlayerCount"),
  resetButton: document.querySelector("#hostResetButton"),
  winnerMeta: document.querySelector("#hostWinnerMeta"),
  winnerName: document.querySelector("#hostWinnerName")
};

function escapeHostHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function hostRequestJson(url, options = {}) {
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

function setHostAuthenticated(authenticated) {
  hostState.authenticated = authenticated;
  hostElements.loginPanel.classList.toggle("hidden", authenticated);
  hostElements.dashboard.classList.toggle("hidden", !authenticated);
  hostElements.connectionStatus.textContent = authenticated ? "Live dashboard open" : "Sign in required";

  if (authenticated) {
    connectHostEvents();
  } else {
    disconnectHostEvents();
  }
}

function renderHostNameList(container, names, emptyMessage) {
  if (!names.length) {
    container.textContent = emptyMessage;
    return;
  }

  container.innerHTML = names
    .map((name, index) => {
      const comma = index < names.length - 1 ? '<span class="name-comma">, </span>' : "";
      return `<span class="available-name-item available-name-item-${index % 2}">${escapeHostHtml(name)}</span>${comma}`;
    })
    .join("");
}

function renderHostWinner(dashboard) {
  const nearestGuess = dashboard.nearestGuess || null;
  const fakeWinnerName = dashboard.fakeWinnerName || "Teddy-Tami-Tili-Guchi-Damien";

  hostElements.winnerName.classList.remove("is-real-winner", "is-fake-winner", "is-hidden-winner");
  hostElements.winnerName.classList.add(`is-${hostState.winnerMode}-winner`);

  if (hostState.winnerMode === "fake") {
    hostElements.winnerName.textContent = fakeWinnerName;
    hostElements.winnerMeta.textContent = "The board is masked with a decoy name.";
    return;
  }

  if (hostState.winnerMode === "hidden") {
    hostElements.winnerName.textContent = "Ready for the reveal";
    hostElements.winnerMeta.textContent = "Use Mask Winner to tease the room, then show the real winner.";
    return;
  }

  if (!nearestGuess) {
    hostElements.winnerName.textContent = "No winner yet";
    hostElements.winnerMeta.textContent = "Waiting for guest guesses.";
    return;
  }

  hostElements.winnerName.textContent = nearestGuess.name;
  hostElements.winnerMeta.textContent = "Real winner is showing. Guess numbers stay hidden on this host screen.";
}

function renderHostDashboard(payload) {
  const dashboard = payload.dashboard || {};
  const summary = payload.summary || {};
  const previousGuessEnabled = hostState.guessEnabled;

  hostState.guessEnabled = dashboard.guessEnabled !== false;
  hostState.winnerMode = dashboard.winnerMode || "hidden";
  hostElements.ageTotal.textContent = String(dashboard.accumulatedAge ?? 0);
  hostElements.playerCount.textContent = String(summary.userCount ?? 0);
  hostElements.needGuessCount.textContent = String((summary.availableGuessNames || []).length);
  hostElements.guessToggleButton.textContent = hostState.guessEnabled ? "Disable Guess Tab" : "Enable Guess Tab";
  hostElements.guessToggleButton.classList.toggle("is-selected", hostState.guessEnabled);
  hostElements.guessToggleButton.classList.toggle("is-disabled-toggle", !hostState.guessEnabled);
  hostElements.guessToggleButton.setAttribute("aria-pressed", String(hostState.guessEnabled));
  if (previousGuessEnabled !== hostState.guessEnabled) {
    pulseHostButton(hostElements.guessToggleButton);
  }
  hostElements.maskWinnerButton.classList.toggle("is-selected", hostState.winnerMode === "fake");
  hostElements.maskWinnerButton.textContent = hostState.winnerMode === "fake" ? "Show Real Winner" : "Mask Winner";
  hostElements.maskWinnerButton.setAttribute("aria-pressed", String(hostState.winnerMode === "fake"));

  renderHostWinner(dashboard);
  renderHostNameList(hostElements.needGuessNames, summary.availableGuessNames || [], "Everyone has submitted a guess.");
  renderHostNameList(hostElements.guessNames, summary.guessNames || [], "No guesses submitted yet.");

  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
  const backendLabel = payload.backend === "firebase" ? "Firebase" : "local data";
  hostElements.lastUpdated.textContent = `Live from ${backendLabel}. Updated ${updatedAt.toLocaleTimeString()}.`;
}

function pulseHostButton(button) {
  button.classList.remove("is-pulsing");
  void button.offsetWidth;
  button.classList.add("is-pulsing");
}

function disconnectHostEvents() {
  if (hostState.eventSource) {
    hostState.eventSource.close();
    hostState.eventSource = null;
  }
}

function connectHostEvents() {
  disconnectHostEvents();
  hostElements.connectionStatus.textContent = "Connecting live updates...";

  const eventSource = new EventSource("/api/admin/events");
  hostState.eventSource = eventSource;

  eventSource.onopen = () => {
    hostElements.connectionStatus.textContent = "Live updates connected";
  };

  eventSource.onmessage = (event) => {
    renderHostDashboard(JSON.parse(event.data));
  };

  eventSource.onerror = () => {
    hostElements.connectionStatus.textContent = "Reconnecting live updates...";
  };
}

async function refreshHostDashboard() {
  const dashboard = await hostRequestJson("/api/admin/dashboard");
  const summary = await hostRequestJson("/api/summary");
  renderHostDashboard({
    dashboard,
    summary,
    updatedAt: Date.now()
  });
}

async function refreshHostGuestQr() {
  if (!hostElements.guestQrLink || !hostElements.guestQrImage) {
    return;
  }

  try {
    const link = await hostRequestJson("/api/guest-link");
    hostElements.guestQrLink.href = link.guestUrl;
    hostElements.guestQrLink.textContent = link.guestUrl;
    hostElements.guestQrImage.src = `${link.qrUrl}?t=${Date.now()}`;
    hostElements.posterGuestLink.textContent = link.guestUrl;
    hostElements.posterQrImage.src = `${link.qrUrl}?t=${Date.now()}`;
  } catch {
    hostElements.guestQrLink.textContent = "Guest QR unavailable";
    hostElements.posterGuestLink.textContent = "Guest QR unavailable";
  }
}

async function setHostWinnerMode(winnerMode) {
  const result = await hostRequestJson("/api/admin/winner-mode", {
    body: JSON.stringify({ winnerMode }),
    method: "POST"
  });
  renderHostDashboard({
    dashboard: result.dashboard,
    summary: result.summary,
    updatedAt: Date.now()
  });
}

hostElements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await hostRequestJson("/api/admin/login", {
      body: JSON.stringify({ password: hostElements.password.value }),
      method: "POST"
    });
    hostElements.loginForm.reset();
    setHostAuthenticated(true);
    await refreshHostDashboard();
  } catch (error) {
    alert(error.message);
  }
});

hostElements.maskWinnerButton.addEventListener("click", async () => {
  pulseHostButton(hostElements.maskWinnerButton);
  try {
    await setHostWinnerMode(hostState.winnerMode === "fake" ? "real" : "fake");
  } catch (error) {
    alert(error.message);
  }
});

hostElements.guessToggleButton.addEventListener("click", async () => {
  pulseHostButton(hostElements.guessToggleButton);
  try {
    const result = await hostRequestJson("/api/admin/guess-tab", {
      body: JSON.stringify({ enabled: !hostState.guessEnabled }),
      method: "POST"
    });
    renderHostDashboard({
      dashboard: result.dashboard,
      summary: result.summary,
      updatedAt: Date.now()
    });
  } catch (error) {
    alert(error.message);
  }
});

hostElements.resetButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Are you sure you want to reset all ages and guesses?");

  if (!confirmed) {
    return;
  }

  const reallyConfirmed = window.confirm("Are you really, really sure? This clears the whole game.");

  if (!reallyConfirmed) {
    return;
  }

  try {
    const result = await hostRequestJson("/api/admin/clear", { method: "POST" });
    renderHostDashboard({
      dashboard: result.dashboard,
      summary: result.summary,
      updatedAt: Date.now()
    });
  } catch (error) {
    alert(error.message);
  }
});

hostElements.printQrButton.addEventListener("click", () => {
  window.print();
});

hostElements.logoutButton.addEventListener("click", async () => {
  try {
    await hostRequestJson("/api/admin/logout", { method: "POST" });
  } finally {
    setHostAuthenticated(false);
  }
});

async function initializeHostDashboard() {
  try {
    await refreshHostGuestQr();
    const session = await hostRequestJson("/api/admin/session");
    setHostAuthenticated(Boolean(session.authenticated));
    if (session.authenticated) {
      await refreshHostDashboard();
    }
  } catch (error) {
    hostElements.connectionStatus.textContent = "Dashboard unavailable";
  }
}

window.addEventListener("beforeunload", disconnectHostEvents);
initializeHostDashboard();
