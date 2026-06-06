const hostState = {
  authenticated: false,
  eventSource: null,
  guessEnabled: true,
  winnerMode: "hidden"
};

const hostElements = {
  connectionStatus: document.querySelector("#hostConnectionStatus"),
  correctTotal: document.querySelector("#hostCorrectTotal"),
  dashboard: document.querySelector("#hostDashboard"),
  guessedBadge: document.querySelector("#hostGuessedBadge"),
  guessNames: document.querySelector("#hostGuessNames"),
  guessToggleButton: document.querySelector("#hostGuessToggleButton"),
  guestQrImage: document.querySelector("#hostGuestQrImage"),
  guestQrLink: document.querySelector("#hostGuestQrLink"),
  lastUpdated: document.querySelector("#hostLastUpdated"),
  loginForm: document.querySelector("#hostLoginForm"),
  loginPanel: document.querySelector("#hostLoginPanel"),
  logoutButton: document.querySelector("#hostLogoutButton"),
  maskWinnerButton: document.querySelector("#hostMaskWinnerButton"),
  needGuessNames: document.querySelector("#hostNeedGuessNames"),
  password: document.querySelector("#hostPassword"),
  posterGuestLink: document.querySelector("#hostPosterGuestLink"),
  posterQrImage: document.querySelector("#hostPosterQrImage"),
  printQrButton: document.querySelector("#hostPrintQrButton"),
  resetButton: document.querySelector("#hostResetButton"),
  waitingBadge: document.querySelector("#hostWaitingBadge"),
  winnerDifference: document.querySelector("#hostWinnerDifference"),
  winnerGuess: document.querySelector("#hostWinnerGuess"),
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
    container.classList.add("is-empty");
    return;
  }

  container.classList.remove("is-empty");
  container.innerHTML = names
    .map((name, index) => {
      const comma = index < names.length - 1 ? '<span class="name-comma">, </span>' : "";
      return `<span class="available-name-item available-name-item-${index % 2}">${escapeHostHtml(name)}</span>${comma}`;
    })
    .join("");
}

function renderHostWaitingList(container, names, emptyMessage) {
  if (!names.length) {
    container.textContent = emptyMessage;
    container.classList.add("is-empty");
    return;
  }

  container.classList.remove("is-empty");
  container.innerHTML = names
    .map((name) => `
      <div class="host-person-row">
        <span class="host-person-avatar" aria-hidden="true">${escapeHostHtml(name.charAt(0) || "?")}</span>
        <span class="host-person-name">${escapeHostHtml(name)}</span>
      </div>
    `)
    .join("");
}

function renderHostGuessList(container, guesses, emptyMessage) {
  if (!guesses.length) {
    container.textContent = emptyMessage;
    container.classList.add("is-empty");
    return;
  }

  container.classList.remove("is-empty");
  container.innerHTML = guesses
    .map((guess) => {
      const name = normalizeHostDisplayName(guess.name);
      const value = Number(guess.estimatedTotalAge);
      const visibleValue = Number.isFinite(value) ? value : "-";
      const winDataVisible = hostState.winnerMode === "real";
      const valueLabel = winDataVisible ? visibleValue : "Hidden";
      const valueClass = winDataVisible ? "" : " is-masked";

      return `
        <div class="host-person-row host-guess-row">
          <span class="host-person-avatar" aria-hidden="true">${escapeHostHtml(name.charAt(0) || "?")}</span>
          <span class="host-person-name">${escapeHostHtml(name)}</span>
          <span class="host-guess-value${valueClass}">${escapeHostHtml(valueLabel)}</span>
        </div>
      `;
    })
    .join("");
}

function normalizeHostDisplayName(name) {
  return String(name || "Guest").trim() || "Guest";
}

function renderHostWinner(dashboard) {
  const nearestGuess = dashboard.nearestGuess || null;
  const winDataVisible = hostState.winnerMode === "real";

  hostElements.winnerName.classList.remove("is-real-winner", "is-fake-winner", "is-hidden-winner");
  hostElements.winnerName.classList.add(winDataVisible ? "is-real-winner" : "is-hidden-winner");

  if (!nearestGuess) {
    hostElements.winnerName.textContent = winDataVisible ? "No winner yet" : "Ready for the reveal";
    hostElements.winnerMeta.textContent = "Waiting for guest guesses.";
    hostElements.winnerGuess.textContent = "--";
    hostElements.correctTotal.textContent = String(dashboard.accumulatedAge ?? 0);
    hostElements.winnerDifference.textContent = "--";
    return;
  }

  const guessedTotal = Number(nearestGuess.estimatedTotalAge);
  const correctTotal = Number(dashboard.accumulatedAge ?? 0);
  const difference = Number(nearestGuess.difference);

  hostElements.winnerGuess.textContent = winDataVisible && Number.isFinite(guessedTotal) ? String(guessedTotal) : "--";
  hostElements.correctTotal.textContent = winDataVisible && Number.isFinite(correctTotal) ? String(correctTotal) : "--";
  hostElements.winnerDifference.textContent = winDataVisible && Number.isFinite(difference) ? String(difference) : "--";

  if (!winDataVisible) {
    hostElements.winnerName.textContent = "Ready for the reveal";
    hostElements.winnerMeta.textContent = "Use Show Win Data to reveal the winner, guesses, correct total, and difference.";
    return;
  }

  hostElements.winnerName.textContent = nearestGuess.name;
  hostElements.winnerMeta.textContent = "Winner data is showing. Guessed totals are visible for the reveal.";
}

function renderHostDashboard(payload) {
  const dashboard = payload.dashboard || {};
  const summary = payload.summary || {};
  const previousGuessEnabled = hostState.guessEnabled;

  hostState.guessEnabled = dashboard.guessEnabled !== false;
  hostState.winnerMode = dashboard.winnerMode || "hidden";
  hostElements.waitingBadge.textContent = String((summary.availableGuessNames || []).length);
  hostElements.guessedBadge.textContent = String((dashboard.guesses || []).length);
  hostElements.guessToggleButton.textContent = hostState.guessEnabled ? "Disable Guess Tab" : "Enable Guess Tab";
  hostElements.guessToggleButton.classList.toggle("is-selected", hostState.guessEnabled);
  hostElements.guessToggleButton.classList.toggle("is-disabled-toggle", !hostState.guessEnabled);
  hostElements.guessToggleButton.setAttribute("aria-pressed", String(hostState.guessEnabled));
  if (previousGuessEnabled !== hostState.guessEnabled) {
    pulseHostButton(hostElements.guessToggleButton);
  }
  hostElements.maskWinnerButton.classList.toggle("is-selected", hostState.winnerMode === "real");
  hostElements.maskWinnerButton.textContent = hostState.winnerMode === "real" ? "Hide Win Data" : "Show Win Data";
  hostElements.maskWinnerButton.setAttribute("aria-pressed", String(hostState.winnerMode === "real"));

  renderHostWinner(dashboard);
  renderHostWaitingList(hostElements.needGuessNames, summary.availableGuessNames || [], "Everyone has submitted a guess.");
  renderHostGuessList(hostElements.guessNames, dashboard.guesses || [], "No guesses submitted yet.");

  const updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
  const backendLabel = payload.backend === "firebase" ? "Firebase" : "local data";
  hostElements.lastUpdated.textContent = `Live from ${backendLabel}. Updated ${updatedAt.toLocaleTimeString()}.`;
}

function pulseHostButton(button) {
  button.classList.remove("is-pulsing");
  void button.offsetWidth;
  button.classList.add("is-pulsing");
}

function printHostQrPoster() {
  const posterUrl = `/qr-poster?print=1&t=${Date.now()}`;
  const shouldUseCurrentTab = window.matchMedia("(max-width: 700px)").matches
    || /iP(?:hone|ad|od)/.test(navigator.userAgent);

  if (shouldUseCurrentTab) {
    window.location.href = posterUrl;
    return;
  }

  const printWindow = window.open(posterUrl, "_blank");

  if (printWindow) {
    printWindow.focus();
  } else {
    window.location.href = posterUrl;
  }
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
    await setHostWinnerMode(hostState.winnerMode === "real" ? "hidden" : "real");
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

hostElements.printQrButton.addEventListener("click", printHostQrPoster);

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
