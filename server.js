const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const os = require("os");
const QRCode = require("qrcode");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const dataFile = path.join(dataDir, "store.json");
const staticFiles = new Set(["index.html", "instructions.html", "host-help.html", "app.js", "host.html", "host.js", "styles.css"]);
const assetDir = path.join(rootDir, "public", "assets");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;
const adminPassword = process.env.ADMIN_PASSWORD || "admin3462";
const sessionSecret = process.env.SESSION_SECRET || "local-network-session-secret";
const sessionDurationMs = 12 * 60 * 60 * 1000;
const fakeWinnerName = "Teddy-Tami-Tili-Guchi-Damien";
const winnerModes = new Set(["hidden", "real", "fake"]);
const dataBackend = String(process.env.DATA_BACKEND || "local").toLowerCase();
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const firebaseGameId = process.env.FIREBASE_GAME_ID || "age-pool-tracker";
const firebaseDatabaseURL = process.env.FIREBASE_DATABASE_URL || "https://shawncountdown-default-rtdb.firebaseio.com";
const firebaseDataRoot = process.env.FIREBASE_DATA_ROOT || "ageGames";
const liveClients = new Set();
const publicLiveClients = new Set();
let storeAdapterPromise = null;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

const defaultStore = {
  settings: {
    guessEnabled: true,
    winnerMode: "hidden"
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

function createHash(value) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(String(value))
    .digest("base64url");
}

function normalizeSourceToken(value) {
  const token = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{16,128}$/.test(token) ? token : "";
}

function parseBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return { day, month, year };
}

function calculateAgeFromBirthDate(birthDate, now = new Date()) {
  let age = now.getFullYear() - birthDate.year;
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  if (currentMonth < birthDate.month || (currentMonth === birthDate.month && currentDay < birthDate.day)) {
    age -= 1;
  }

  return age;
}

function normalizeBirthDate(value) {
  const birthDate = parseBirthDate(value);

  if (!birthDate) {
    return { error: "Choose a valid birth month, day, and year." };
  }

  const birthTime = Date.UTC(birthDate.year, birthDate.month - 1, birthDate.day);
  const today = new Date();
  const todayTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  if (birthTime > todayTime) {
    return { error: "Birthday cannot be in the future." };
  }

  const age = calculateAgeFromBirthDate(birthDate, today);

  if (!Number.isInteger(age) || age < 0 || age > 130) {
    return { error: "Birthday must calculate to an age from 0 to 130." };
  }

  return {
    age,
    birthDate: `${birthDate.year}-${String(birthDate.month).padStart(2, "0")}-${String(birthDate.day).padStart(2, "0")}`
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseFirebaseCliJson(stdout, fallback) {
  const parsed = safeJsonParse(stdout, undefined);
  if (parsed !== undefined) {
    return parsed;
  }

  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lineValue = safeJsonParse(line, undefined);
    if (lineValue === undefined) {
      continue;
    }

    if (lineValue && typeof lineValue === "object" && lineValue.status && Object.keys(lineValue).length === 1) {
      continue;
    }

    return lineValue;
  }

  return fallback;
}

function normalizeWinnerMode(settings = {}) {
  if (winnerModes.has(settings.winnerMode)) {
    return settings.winnerMode;
  }

  if (settings.winnerRevealed === true) {
    return "fake";
  }

  return "hidden";
}

function buildSettings(settings = {}) {
  return {
    guessEnabled: settings.guessEnabled !== false,
    winnerMode: normalizeWinnerMode(settings)
  };
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}${stderr ? `\n${stderr}` : ""}`;
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

async function ensureLocalStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(defaultStore, null, 2));
  }
}

async function readLocalStore() {
  await ensureLocalStore();
  const file = await fs.readFile(dataFile, "utf8");
  return safeJsonParse(file, defaultStore);
}

async function writeLocalStore(store) {
  await ensureLocalStore();
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2));
}

function readServiceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
  }

  return null;
}

function normalizeFirebasePathSegment(value, fallback) {
  const segment = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return segment || fallback;
}

function getFirebaseStorePath() {
  const safeRoot = normalizeFirebasePathSegment(firebaseDataRoot, "ageGames");
  const safeGameId = normalizeFirebasePathSegment(firebaseGameId, "age-pool-tracker");
  return `/${safeRoot}/${safeGameId}/store`;
}

async function createFirebaseCliStoreAdapter() {
  const storePath = getFirebaseStorePath();
  const baseArgs = ["--project", process.env.FIREBASE_PROJECT_ID || "shawncountdown"];

  return {
    async ensure() {
      const stdout = await runCommand("firebase", ["database:get", storePath, "--json", ...baseArgs]);
      const parsed = parseFirebaseCliJson(stdout, null);
      if (parsed === null) {
        await this.write(defaultStore);
      }
    },
    async read() {
      const stdout = await runCommand("firebase", ["database:get", storePath, "--json", ...baseArgs]);
      return parseFirebaseCliJson(stdout, defaultStore) || defaultStore;
    },
    async write(store) {
      await runCommand("firebase", [
        "database:set",
        storePath,
        "--data",
        JSON.stringify({
          ...cloneStore(store),
          updatedAt: Date.now()
        }),
        ...baseArgs,
        "-f"
      ]);
    }
  };
}

async function createFirebaseStoreAdapter() {
  let firebaseApp;
  let firebaseDatabase;

  try {
    firebaseApp = require("firebase-admin/app");
    firebaseDatabase = require("firebase-admin/database");
  } catch (error) {
    throw new Error("Firebase mode requires setup first: run npm install firebase-admin and configure Firebase service account env vars.");
  }

  const { applicationDefault, cert, getApps, initializeApp } = firebaseApp;
  const { getDatabase, ServerValue } = firebaseDatabase;
  const serviceAccount = readServiceAccountFromEnv();
  const appOptions = {
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    databaseURL: firebaseDatabaseURL
  };

  if (process.env.FIREBASE_PROJECT_ID) {
    appOptions.projectId = process.env.FIREBASE_PROJECT_ID;
  }

  const app = getApps().length ? getApps()[0] : initializeApp(appOptions);
  const database = getDatabase(app);
  const storeRef = database.ref(getFirebaseStorePath().replace(/^\//, ""));

  return {
    async ensure() {
      const snapshot = await storeRef.get();
      if (!snapshot.exists()) {
        await storeRef.set({
          ...cloneStore(defaultStore),
          createdAt: ServerValue.TIMESTAMP,
          updatedAt: ServerValue.TIMESTAMP
        });
      }
    },
    async read() {
      await this.ensure();
      const snapshot = await storeRef.get();
      return snapshot.exists() ? snapshot.val() : cloneStore(defaultStore);
    },
    async write(store) {
      await storeRef.set({
        ...cloneStore(store),
        updatedAt: ServerValue.TIMESTAMP
      });
    }
  };
}

async function getStoreAdapter() {
  if (!storeAdapterPromise) {
    storeAdapterPromise = dataBackend === "firebase"
      ? createFirebaseStoreAdapter()
      : dataBackend === "firebase-cli"
        ? createFirebaseCliStoreAdapter()
      : Promise.resolve({
          ensure: ensureLocalStore,
          read: readLocalStore,
          write: writeLocalStore
        });
  }

  return storeAdapterPromise;
}

function normalizeStore(parsed = {}) {
  return {
    settings: buildSettings(parsed.settings),
    users: Array.isArray(parsed.users) ? parsed.users : [],
    guesses: Array.isArray(parsed.guesses) ? parsed.guesses : []
  };
}

async function ensureStore() {
  const adapter = await getStoreAdapter();
  await adapter.ensure();
}

async function readStore() {
  const adapter = await getStoreAdapter();
  const parsed = await adapter.read();
  return normalizeStore(parsed);
}

async function writeStore(store) {
  const adapter = await getStoreAdapter();
  await adapter.write(normalizeStore(store));
  await broadcastLiveUpdate();
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

function validateNameAndValue(name, numericValue, label, maxValue) {
  const cleanName = normalizeName(name);
  const cleanValue = parseNumber(numericValue);

  if (!cleanName) {
    return { error: "First name is required." };
  }

  if (!Number.isInteger(cleanValue) || cleanValue < 0 || cleanValue > maxValue) {
    return { error: `${label} must be a whole number from 0 to ${maxValue}.` };
  }

  return {
    name: cleanName,
    value: cleanValue
  };
}

function validateCreateEntryBody(body, type) {
  const valueKey = type === "users" ? "age" : "estimatedTotalAge";
  const label = type === "users" ? "Age" : "Estimated total age";
  const maxValue = type === "users" ? 130 : 130000;
  const token = normalizeSourceToken(body.sourceToken);

  if (!token) {
    return { error: "Open the guest link from this device before submitting." };
  }

  if (type === "users" && body.birthDate) {
    const cleanName = normalizeName(body.name);
    const birthDateResult = normalizeBirthDate(body.birthDate);

    if (!cleanName) {
      return { error: "First name is required." };
    }

    if (birthDateResult.error) {
      return { error: birthDateResult.error };
    }

    return {
      birthDate: birthDateResult.birthDate,
      name: cleanName,
      sourceTokenHash: createHash(token),
      value: birthDateResult.age
    };
  }

  const validated = validateNameAndValue(body.name, body[valueKey], label, maxValue);

  if (validated.error) {
    return validated;
  }

  return {
    ...validated,
    sourceTokenHash: createHash(token)
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

function buildAdminDashboard(store) {
  const totals = getTotals(store);
  const winnerMode = normalizeWinnerMode(store.settings);

  return {
    accumulatedAge: totals.userTotal,
    fakeWinnerName,
    guessEnabled: store.settings?.guessEnabled !== false,
    guessTotal: totals.guessTotal,
    guesses: sortDescending(store.guesses, "estimatedTotalAge"),
    nearestGuess: findNearestGuess(store),
    users: sortDescending(store.users, "age"),
    winnerMode
  };
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function buildLivePayload() {
  const store = await readStore();
  return {
    backend: dataBackend === "firebase" || dataBackend === "firebase-cli" ? "firebase" : "local",
    dashboard: buildAdminDashboard(store),
    summary: buildPublicSummary(store),
    updatedAt: Date.now()
  };
}

async function broadcastLiveUpdate() {
  if (!liveClients.size && !publicLiveClients.size) {
    return;
  }

  try {
    const payload = await buildLivePayload();
    liveClients.forEach((client) => {
      try {
        writeSse(client, payload);
      } catch {
        liveClients.delete(client);
      }
    });
    publicLiveClients.forEach((client) => {
      try {
        writeSse(client, {
          summary: payload.summary,
          updatedAt: payload.updatedAt
        });
      } catch {
        publicLiveClients.delete(client);
      }
    });
  } catch {
    // Live dashboard updates are helpful, but writes should not fail because a client disconnected.
  }
}

async function handleCreateEntry(request, response, type) {
  const body = await readRequestBody(request);

  if (!body || typeof body !== "object") {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const valueKey = type === "users" ? "age" : "estimatedTotalAge";
  const validated = validateCreateEntryBody(body, type);

  if (validated.error) {
    sendJson(response, 400, { error: validated.error });
    return;
  }

  const store = await readStore();
  const tokenMatchedUser = store.users.find((entry) => entry.sourceTokenHash && entry.sourceTokenHash === validated.sourceTokenHash);
  const tokenMatchedGuess = store.guesses.find((entry) => entry.sourceTokenHash && entry.sourceTokenHash === validated.sourceTokenHash);

  if (type === "users" && tokenMatchedUser) {
    sendJson(response, 409, { error: "This device already added an age. Ask the host to reset if you need to fix it." });
    return;
  }

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

    if (!tokenMatchedUser) {
      sendJson(response, 400, { error: "Check in with your age before making a guess." });
      return;
    }

    if (tokenMatchedGuess) {
      sendJson(response, 409, { error: "This device already submitted a guess. Ask the host to reset if you need to fix it." });
      return;
    }

    if (tokenMatchedUser && normalizeKey(tokenMatchedUser.name) !== normalizeKey(validated.name)) {
      sendJson(response, 400, { error: "Use the same first name you used when adding your age." });
      return;
    }
  }

  const duplicate = store[type].some((entry) => normalizeKey(entry.name) === normalizeKey(validated.name));

  if (duplicate) {
    sendJson(response, 409, { error: "Duplicated name. Try again." });
    return;
  }

  store[type].push({
    ...(validated.birthDate ? { birthDate: validated.birthDate } : {}),
    createdAt: Date.now(),
    [valueKey]: validated.value,
    name: validated.name,
    sourceTokenHash: validated.sourceTokenHash
  });

  await writeStore(store);

  sendJson(response, 201, {
    entry: store[type][store[type].length - 1],
    summary: buildPublicSummary(store),
    totals: getTotals(store)
  });
}

function getPreferredGuestUrl(request) {
  if (publicBaseUrl) {
    return `${publicBaseUrl}/guest`;
  }

  const forwardedHost = getFirstHeaderValue(request.headers["x-forwarded-host"]);
  const forwardedProto = getFirstHeaderValue(request.headers["x-forwarded-proto"]);
  const hostHeader = forwardedHost || request.headers.host || `localhost:${port}`;
  const [hostname, requestedPort] = hostHeader.split(":");
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const protocol = forwardedProto || (isLoopback ? "http" : "https");
  const origin = `${protocol}://${hostHeader}`;

  if (isLoopback) {
    const [lanUrl] = getNetworkUrls(Number(requestedPort) || port);
    if (lanUrl) {
      return `${lanUrl}/guest`;
    }
  }

  return `${origin}/guest`;
}

function getFirstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : value || "")
    .split(",")[0]
    .trim();
}

function handleGuestLink(request, response) {
  const guestUrl = getPreferredGuestUrl(request);
  sendJson(response, 200, {
    guestUrl,
    qrUrl: "/api/guest-qr.svg"
  });
}

async function handleGuestQr(request, response) {
  const guestUrl = getPreferredGuestUrl(request);
  const svg = await QRCode.toString(guestUrl, {
    color: {
      dark: "#241915",
      light: "#fffdf7"
    },
    errorCorrectionLevel: "M",
    margin: 1,
    type: "svg",
    width: 320
  });

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "image/svg+xml; charset=utf-8"
  });
  response.end(svg);
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
  sendJson(response, 200, buildAdminDashboard(store));
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
    winnerMode: normalizeWinnerMode(store.settings)
  };
  await writeStore(store);

  sendJson(response, 200, {
    dashboard: buildAdminDashboard(store),
    ok: true,
    summary: buildPublicSummary(store)
  });
}

async function handleAdminWinnerMode(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  const body = await readRequestBody(request);
  const requestedMode = String(body?.winnerMode || "");

  if (!winnerModes.has(requestedMode)) {
    sendJson(response, 400, { error: "Winner mode must be hidden, real, or fake." });
    return;
  }

  const store = await readStore();
  store.settings = {
    guessEnabled: store.settings?.guessEnabled !== false,
    winnerMode: requestedMode
  };
  await writeStore(store);

  sendJson(response, 200, {
    dashboard: buildAdminDashboard(store),
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
  store.settings = {
    guessEnabled: store.settings?.guessEnabled !== false,
    winnerMode: body?.winnerRevealed === true ? "real" : "hidden"
  };
  await writeStore(store);

  sendJson(response, 200, {
    dashboard: buildAdminDashboard(store),
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
      winnerMode: "hidden"
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
      users: [],
      winnerMode: "hidden"
    },
    ok: true,
    summary: buildPublicSummary(clearedStore)
  });
}

function handleAdminSession(request, response) {
  sendJson(response, 200, { authenticated: hasAdminSession(request) });
}

async function handleAdminEvents(request, response) {
  if (!hasAdminSession(request)) {
    sendJson(response, 401, { error: "Admin login required." });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8"
  });
  response.write(": connected\n\n");
  liveClients.add(response);

  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, 25000);

  request.on("close", () => {
    clearInterval(heartbeat);
    liveClients.delete(response);
  });

  writeSse(response, await buildLivePayload());
}

async function handlePublicEvents(request, response) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8"
  });
  response.write(": connected\n\n");
  publicLiveClients.add(response);

  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, 25000);

  request.on("close", () => {
    clearInterval(heartbeat);
    publicLiveClients.delete(response);
  });

  const payload = await buildLivePayload();
  writeSse(response, {
    summary: payload.summary,
    updatedAt: payload.updatedAt
  });
}

async function serveStatic(response, pathname) {
  const fileName = pathname === "/"
    ? "index.html"
    : pathname === "/guest"
      ? "index.html"
      : pathname === "/host"
        ? "host.html"
        : pathname === "/instructions"
          ? "instructions.html"
          : pathname === "/host-help"
            ? "host-help.html"
            : pathname.replace(/^\/+/, "");

  if (pathname.startsWith("/assets/")) {
    const assetName = pathname.replace(/^\/assets\/+/, "");
    const assetPath = path.join(assetDir, assetName);

    if (!assetPath.startsWith(assetDir)) {
      sendText(response, 404, "Not found");
      return;
    }

    try {
      const content = await fs.readFile(assetPath);
      const extension = path.extname(assetName);
      response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
      response.end(content);
    } catch {
      sendText(response, 404, "Not found");
    }

    return;
  }

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

function getNetworkUrls(urlPort = port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${urlPort}`);
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

      if (request.method === "GET" && url.pathname === "/api/events") {
        await handlePublicEvents(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/guest-link") {
        handleGuestLink(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/guest-qr.svg") {
        await handleGuestQr(request, response);
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

      if (request.method === "POST" && url.pathname === "/api/admin/winner-mode") {
        await handleAdminWinnerMode(request, response);
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

      if (request.method === "GET" && url.pathname === "/api/admin/events") {
        await handleAdminEvents(request, response);
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
  buildAdminDashboard,
  buildPublicSummary,
  createServer,
  defaultStore,
  fakeWinnerName,
  ensureStore,
  getAgeClassificationCounts,
  getTotals,
  parseFirebaseCliJson,
  readStore,
  startServer,
  writeStore
};
