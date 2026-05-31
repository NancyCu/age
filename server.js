const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const dataFile = path.join(dataDir, "store.json");
const staticFiles = new Set(["index.html", "app.js", "styles.css"]);

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;
const adminPassword = process.env.ADMIN_PASSWORD || "admin3462";
const sessionSecret = process.env.SESSION_SECRET || "local-network-session-secret";
const sessionDurationMs = 12 * 60 * 60 * 1000;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const defaultStore = {
  settings: {
    guessEnabled: true,
    winnerRevealed: false
  },
  users: [],
  guesses: []
};

const ageClassificationRanges = [
  { key: "minors", label: "Minors", min: 0, max: 17 },
  { key: "youngAdults", label: "Young Adults", min: 18, max: 25 },
  { key: "adults", label: "Adults", min: 26, max: 64 },
  { key: "seniors", label: "Seniors", min: 65, max: 74 },
  { key: "beyondSeniors", label: "Beyond Seniors", min: 75, max: Infinity }
];

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(name) {
  return normalizeName(name).toLowerCase();
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultStore, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const file = await fs.readFile(dataFile, "utf8");
  const parsed = safeJsonParse(file, defaultStore);

  return {
    settings: {
      guessEnabled: parsed.settings?.guessEnabled !== false,
      winnerRevealed: parsed.settings?.winnerRevealed === true
    },
    users: Array.isArray(parsed.users) ? parsed.users : [],
    guesses: Array.isArray(parsed.guesses) ? parsed.guesses : []
  };
}

async function writeStore(store) {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function readRequestBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  if (!body) {
    return {};
  }

  return safeJsonParse(body, null);
}

function getCookies(request) {
  const header = request.headers.cookie || "";
  const cookies = {};

  header.split(";").forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (!name) {
      return;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
  });

  return cookies;
}

function createSessionToken() {
  const payload = {
    expiresAt: Date.now() + sessionDurationMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [encodedPayload, providedSignature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", sessionSecret)
    .update(encodedPayload)
    .digest("base64url");

  if (providedSignature !== expectedSignature) {
    return false;
  }

  const payload = safeJsonParse(Buffer.from(encodedPayload, "base64url").toString("utf8"), null);
  return Boolean(payload && payload.expiresAt > Date.now());
}

function hasAdminSession(request) {
  const cookies = getCookies(request);
  return verifySessionToken(cookies.admin_session);
}

function getTotals(store) {
  return {
    guessTotal: store.guesses.reduce((sum, entry) => sum + Number(entry.estimatedTotalAge || 0), 0),
    userTotal: store.users.reduce((sum, entry) => sum + Number(entry.age || 0), 0)
  };
}

function getAgeClassificationCounts(store) {
  const counts = Object.fromEntries(ageClassificationRanges.map((range) => [range.key, 0]));

  store.users.forEach((entry) => {
    const age = Number(entry.age);
    const matchingRange = ageClassificationRanges.find((range) => age >= range.min && age <= range.max);

    if (matchingRange) {
      counts[matchingRange.key] += 1;
    }
  });

  return counts;
}

function sortDescending(entries, valueKey) {
  return [...entries].sort((left, right) => {
    const difference = Number(right[valueKey]) - Number(left[valueKey]);
    if (difference !== 0) {
      return difference;
    }

    return String(left.name).localeCompare(String(right.name));
  });
}

function findNearestGuess(store) {
  const { userTotal } = getTotals(store);

  if (!store.guesses.length) {
    return null;
  }

  const ranked = [...store.guesses].sort((left, right) => {
    const leftDiff = Math.abs(Number(left.estimatedTotalAge) - userTotal);
    const rightDiff = Math.abs(Number(right.estimatedTotalAge) - userTotal);

    if (leftDiff !== rightDiff) {
      return leftDiff - rightDiff;
    }

    return Number(left.createdAt) - Number(right.createdAt);
  });

  const winner = ranked[0];

  return {
    difference: Math.abs(Number(winner.estimatedTotalAge) - userTotal),
    estimatedTotalAge: Number(winner.estimatedTotalAge),
    name: winner.name
  };
}

function validateNameAndValue(name, numericValue, label) {
  const cleanName = normalizeName(name);
  const cleanValue = parseNumber(numericValue);

  if (!cleanName) {
    return { error: "First name is required." };
  }

  if (!Number.isInteger(cleanValue) || cleanValue < 0 || cleanValue > 130000) {
    return { error: `${label} must be a whole number from 0 to 130000.` };
  }

  return {
    name: cleanName,
    value: cleanValue
  };
}

async function handlePublicSummary(response) {
  const store = await readStore();
  sendJson(response, 200, {
    ...buildPublicSummary(store)
  });
}

function buildPublicSummary(store) {
  const userNames = store.users.map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  const guessNames = store.guesses.map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  const guessedNameKeys = new Set(store.guesses.map((entry) => normalizeKey(entry.name)));
  const availableGuessNames = userNames.filter((name) => !guessedNameKeys.has(normalizeKey(name)));

  return {
    ageClassifications: getAgeClassificationCounts(store),
    ...getTotals(store),
    guessEnabled: store.settings?.guessEnabled !== false,
    guessCount: store.guesses.length,
    availableGuessNames,
    guessNames,
    userCount: store.users.length,
    userNames
  };
}

async function handleCreateEntry(request, response, type) {
  const body = await readRequestBody(request);

  if (!body || typeof body !== "object") {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const valueKey = type === "users" ? "age" : "estimatedTotalAge";
  const label = type === "users" ? "Age" : "Estimated total age";
  const validated = validateNameAndValue(body.name, body[valueKey], label);

  if (validated.error) {
    sendJson(response, 400, { error: validated.error });
    return;
  }

  const store = await readStore();
  if (type === "guesses") {
    if (store.settings?.guessEnabled === false) {
      sendJson(response, 403, { error: "Guess tab is currently disabled." });
      return;
    }

    const matchingUser = store.users.some((entry) => normalizeKey(entry.name) === normalizeKey(validated.name));

    if (!matchingUser) {
      sendJson(response, 400, { error: "Invalid name. Enter a first name that already exists in the User tab." });
      return;
    }
  }

  const duplicate = store[type].some((entry) => normalizeKey(entry.name) === normalizeKey(validated.name));

  if (duplicate) {
    sendJson(response, 409, { error: "Duplicated name. Try again." });
    return;
  }

  store[type].push({
    createdAt: Date.now(),
    [valueKey]: validated.value,
    name: validated.name
  });

  await writeStore(store);

  sendJson(response, 201, {
    entry: store[type][store[type].length - 1],
    summary: buildPublicSummary(store),
    totals: getTotals(store)
  });
}

async function handleAdminLogin(request, response) {
  const body = await readRequestBody(request);
  const providedPassword = String(body?.password || "");
  const expected = Buffer.from(adminPassword);
  const received = Buffer.from(providedPassword);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    sendJson(response, 401, { error: "Invalid admin password." });
    return;
  }

  const token = createSessionToken();
  response.setHeader("Set-Cookie", `admin_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${sessionDurationMs / 1000}`);
  sendJson(response, 200, { ok: true });
}

function handleAdminLogout(response) {
  response.setHeader("Set-Cookie", "admin_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0");
  sendJson(response, 200, { ok: true });
}

async function handleAdminDashboard(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  const store = await readStore();
  const totals = getTotals(store);

  sendJson(response, 200, {
    accumulatedAge: totals.userTotal,
    guessEnabled: store.settings?.guessEnabled !== false,
    guessTotal: totals.guessTotal,
    guesses: sortDescending(store.guesses, "estimatedTotalAge"),
    nearestGuess: findNearestGuess(store),
    winnerRevealed: store.settings?.winnerRevealed === true,
    users: sortDescending(store.users, "age")
  });
}

async function handleAdminGuessToggle(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  const body = await readRequestBody(request);
  if (!body || typeof body.enabled !== "boolean") {
    sendJson(response, 400, { error: "Enabled flag must be provided." });
    return;
  }

  const store = await readStore();
  store.settings = {
    guessEnabled: body.enabled,
    winnerRevealed: store.settings?.winnerRevealed === true
  };
  await writeStore(store);

  const totals = getTotals(store);
  sendJson(response, 200, {
    dashboard: {
      accumulatedAge: totals.userTotal,
      guessEnabled: store.settings.guessEnabled,
      guessTotal: totals.guessTotal,
      guesses: sortDescending(store.guesses, "estimatedTotalAge"),
      nearestGuess: findNearestGuess(store),
      winnerRevealed: store.settings.winnerRevealed,
      users: sortDescending(store.users, "age")
    },
    ok: true,
    summary: buildPublicSummary(store)
  });
}

async function handleAdminRevealWinner(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  const body = await readRequestBody(request);
  const store = await readStore();
  const nextWinnerRevealed = typeof body?.winnerRevealed === "boolean"
    ? body.winnerRevealed
    : !(store.settings?.winnerRevealed === true);
  store.settings = {
    guessEnabled: store.settings?.guessEnabled !== false,
    winnerRevealed: nextWinnerRevealed
  };
  await writeStore(store);

  const totals = getTotals(store);
  sendJson(response, 200, {
    dashboard: {
      accumulatedAge: totals.userTotal,
      guessEnabled: store.settings.guessEnabled,
      guessTotal: totals.guessTotal,
      guesses: sortDescending(store.guesses, "estimatedTotalAge"),
      nearestGuess: findNearestGuess(store),
      winnerRevealed: store.settings.winnerRevealed,
      users: sortDescending(store.users, "age")
    },
    ok: true,
    summary: buildPublicSummary(store)
  });
}

async function handleAdminClear(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  const existingStore = await readStore();
  const clearedStore = {
    settings: {
      guessEnabled: existingStore.settings?.guessEnabled !== false,
      winnerRevealed: false
    },
    users: [],
    guesses: []
  };

  await writeStore(clearedStore);

  sendJson(response, 200, {
    dashboard: {
      accumulatedAge: 0,
      guessEnabled: clearedStore.settings.guessEnabled,
      guessTotal: 0,
      guesses: [],
      nearestGuess: null,
      winnerRevealed: false,
      users: []
    },
    ok: true,
    summary: buildPublicSummary(clearedStore)
  });
}

function handleAdminSession(request, response) {
  sendJson(response, 200, { authenticated: hasAdminSession(request) });
}

async function serveStatic(response, pathname) {
  const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");

  if (!staticFiles.has(fileName)) {
    sendText(response, 404, "Not found");
    return;
  }

  const filePath = path.join(rootDir, fileName);
  const extension = path.extname(fileName);
  const content = await fs.readFile(filePath);

  response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
  response.end(content);
}

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    });
  });

  return urls;
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, port, service: "age-guess-admin-app" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/summary") {
        await handlePublicSummary(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/users") {
        await handleCreateEntry(request, response, "users");
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/guesses") {
        await handleCreateEntry(request, response, "guesses");
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/login") {
        await handleAdminLogin(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/logout") {
        handleAdminLogout(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/clear") {
        await handleAdminClear(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/guess-tab") {
        await handleAdminGuessToggle(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/reveal-winner") {
        await handleAdminRevealWinner(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/session") {
        handleAdminSession(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
        await handleAdminDashboard(request, response);
        return;
      }

      if (request.method === "GET") {
        await serveStatic(response, url.pathname);
        return;
      }

      sendText(response, 405, "Method not allowed");
    } catch (error) {
      sendJson(response, 500, { error: error.message || "Unexpected server error." });
    }
  });
}

async function startServer() {
  await ensureStore();

  const server = createServer();

  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });

  console.log(`Age Guess app is running at http://localhost:${port}`);

  const networkUrls = getNetworkUrls();
  if (networkUrls.length) {
    console.log(`LAN access: ${networkUrls.join(", ")}`);
  }

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  ageClassificationRanges,
  buildPublicSummary,
  createServer,
  defaultStore,
  ensureStore,
  getAgeClassificationCounts,
  getTotals,
  readStore,
  startServer,
  writeStore
};
