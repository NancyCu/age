const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const { TextDecoder } = require("util");

const projectRoot = path.join(__dirname, "..");
const dataFile = path.join(projectRoot, "data", "store.json");
process.env.ADMIN_PASSWORD = "secretpw";
process.env.SESSION_SECRET = "test-session-secret";
const { parseFirebaseCliJson } = require("../server.js");

async function resetStore() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(
    dataFile,
    JSON.stringify(
      {
        settings: {
          guessEnabled: true,
          winnerMode: "hidden"
        },
        guesses: [],
        users: []
      },
      null,
      2
    )
  );
}

test("firebase CLI parser ignores trailing status output", () => {
  const parsed = parseFirebaseCliJson(
    '{"settings":{"guessEnabled":true,"winnerMode":"real"},"users":[],"guesses":[]}\n{"status":"success"}\n',
    null
  );

  assert.deepEqual(parsed, {
    guesses: [],
    settings: {
      guessEnabled: true,
      winnerMode: "real"
    },
    users: []
  });
});

test("user, guess, duplicate, and admin flows work", async () => {
  await resetStore();

  const { createServer } = require("../server.js");
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    let response = await fetch(`${baseUrl}/api/users`, {
      body: JSON.stringify({ age: 30, name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 201);
    let createPayload = await response.json();
    assert.deepEqual(createPayload.summary.ageClassifications, {
      adults: 1,
      beyondSeniors: 0,
      minors: 0,
      seniors: 0,
      youngAdults: 0
    });
    assert.deepEqual(createPayload.summary.availableGuessNames, ["Alice"]);
    assert.equal(createPayload.summary.guessEnabled, true);
    assert.deepEqual(createPayload.summary.userNames, ["Alice"]);
    assert.deepEqual(createPayload.summary.guessNames, []);

    response = await fetch(`${baseUrl}/api/users`, {
      body: JSON.stringify({ age: 15, name: "Mia" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 201);
    createPayload = await response.json();
    assert.deepEqual(createPayload.summary.ageClassifications, {
      adults: 1,
      beyondSeniors: 0,
      minors: 1,
      seniors: 0,
      youngAdults: 0
    });
    assert.deepEqual(createPayload.summary.availableGuessNames, ["Alice", "Mia"]);
    assert.deepEqual(createPayload.summary.userNames, ["Alice", "Mia"]);

    response = await fetch(`${baseUrl}/api/users`, {
      body: JSON.stringify({ age: 71, name: "Nora" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 201);

    response = await fetch(`${baseUrl}/api/users`, {
      body: JSON.stringify({ age: 40, name: "alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 409);

    response = await fetch(`${baseUrl}/api/guesses`, {
      body: JSON.stringify({ estimatedTotalAge: 41, name: "Ben" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Invalid name. Enter a first name that already exists in the User tab.");

    response = await fetch(`${baseUrl}/api/guesses`, {
      body: JSON.stringify({ estimatedTotalAge: 34, name: "Ben" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400);

    response = await fetch(`${baseUrl}/api/guesses`, {
      body: JSON.stringify({ estimatedTotalAge: 34, name: "Alice" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 201);
    createPayload = await response.json();
    assert.deepEqual(createPayload.summary.availableGuessNames, ["Mia", "Nora"]);

    response = await fetch(`${baseUrl}/api/summary`);
    const summary = await response.json();
    assert.deepEqual(summary, {
      ageClassifications: {
        adults: 1,
        beyondSeniors: 0,
        minors: 1,
        seniors: 1,
        youngAdults: 0
      },
      availableGuessNames: ["Mia", "Nora"],
      guessEnabled: true,
      guessCount: 1,
      guessNames: ["Alice"],
      guessTotal: 34,
      userCount: 3,
      userNames: ["Alice", "Mia", "Nora"],
      userTotal: 116
    });

    response = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.equal(response.status, 401);

    response = await fetch(`${baseUrl}/api/admin/login`, {
      body: JSON.stringify({ password: "secretpw" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);

    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);

    response = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: cookie }
    });
    assert.equal(response.status, 200);

    const dashboard = await response.json();
    assert.equal(dashboard.accumulatedAge, 116);
    assert.equal(dashboard.guessEnabled, true);
    assert.equal(dashboard.guessTotal, 34);
    assert.equal(dashboard.winnerMode, "hidden");
    assert.equal(dashboard.fakeWinnerName, "Teddy-Tami-Tili-Guchi-Damien");
    assert.equal(dashboard.users[0].name, "Nora");
    assert.equal(dashboard.guesses[0].name, "Alice");
    assert.equal(dashboard.nearestGuess.name, "Alice");
    assert.equal(dashboard.nearestGuess.difference, 82);

    response = await fetch(`${baseUrl}/host`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Host Dashboard/);

    response = await fetch(`${baseUrl}/api/admin/events`);
    assert.equal(response.status, 401);

    const liveAbortController = new AbortController();
    response = await fetch(`${baseUrl}/api/admin/events`, {
      headers: { Cookie: cookie },
      signal: liveAbortController.signal
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const reader = response.body.getReader();
    let liveText = "";
    while (!liveText.includes("\"summary\"")) {
      const liveChunk = await reader.read();
      assert.equal(liveChunk.done, false);
      liveText += new TextDecoder().decode(liveChunk.value);
    }
    liveAbortController.abort();
    assert.match(liveText, /"summary"/);
    assert.match(liveText, /"dashboard"/);

    response = await fetch(`${baseUrl}/api/admin/winner-mode`, {
      body: JSON.stringify({ winnerMode: "real" }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);
    const realWinner = await response.json();
    assert.equal(realWinner.dashboard.winnerMode, "real");
    assert.equal(realWinner.dashboard.nearestGuess.name, "Alice");

    response = await fetch(`${baseUrl}/api/admin/winner-mode`, {
      body: JSON.stringify({ winnerMode: "fake" }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);
    const fakeWinner = await response.json();
    assert.equal(fakeWinner.dashboard.winnerMode, "fake");
    assert.equal(fakeWinner.dashboard.fakeWinnerName, "Teddy-Tami-Tili-Guchi-Damien");
    assert.equal(fakeWinner.dashboard.nearestGuess.name, "Alice");

    response = await fetch(`${baseUrl}/api/admin/winner-mode`, {
      body: JSON.stringify({ winnerMode: "hidden" }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);
    const hiddenWinner = await response.json();
    assert.equal(hiddenWinner.dashboard.winnerMode, "hidden");

    response = await fetch(`${baseUrl}/api/admin/winner-mode`, {
      body: JSON.stringify({ winnerMode: "confetti" }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400);

    response = await fetch(`${baseUrl}/api/users`, {
      body: JSON.stringify({ age: 131, name: "TooOld" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Age must be a whole number from 0 to 130.");

    response = await fetch(`${baseUrl}/api/admin/guess-tab`, {
      body: JSON.stringify({ enabled: false }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);
    const disabledGuessTab = await response.json();
    assert.equal(disabledGuessTab.summary.guessEnabled, false);
    assert.equal(disabledGuessTab.dashboard.guessEnabled, false);

    response = await fetch(`${baseUrl}/api/summary`);
    const disabledSummary = await response.json();
    assert.equal(disabledSummary.guessEnabled, false);

    response = await fetch(`${baseUrl}/api/guesses`, {
      body: JSON.stringify({ estimatedTotalAge: 120, name: "Mia" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "Guess tab is currently disabled.");

    response = await fetch(`${baseUrl}/api/admin/guess-tab`, {
      body: JSON.stringify({ enabled: true }),
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);
    const enabledGuessTab = await response.json();
    assert.equal(enabledGuessTab.summary.guessEnabled, true);
    assert.equal(enabledGuessTab.dashboard.guessEnabled, true);

    response = await fetch(`${baseUrl}/api/guesses`, {
      body: JSON.stringify({ estimatedTotalAge: 120, name: "Mia" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 201);

    response = await fetch(`${baseUrl}/api/admin/clear`, {
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      method: "POST"
    });
    assert.equal(response.status, 200);

    const cleared = await response.json();
    assert.deepEqual(cleared.summary, {
      ageClassifications: {
        adults: 0,
        beyondSeniors: 0,
        minors: 0,
        seniors: 0,
        youngAdults: 0
      },
      availableGuessNames: [],
      guessEnabled: true,
      guessCount: 0,
      guessNames: [],
      guessTotal: 0,
      userCount: 0,
      userNames: [],
      userTotal: 0
    });
    assert.equal(cleared.dashboard.accumulatedAge, 0);
    assert.equal(cleared.dashboard.guessEnabled, true);
    assert.equal(cleared.dashboard.guessTotal, 0);
    assert.equal(cleared.dashboard.nearestGuess, null);
    assert.equal(cleared.dashboard.winnerMode, "hidden");
    assert.deepEqual(cleared.dashboard.users, []);
    assert.deepEqual(cleared.dashboard.guesses, []);

    response = await fetch(`${baseUrl}/api/summary`);
    const clearedSummary = await response.json();
    assert.equal(clearedSummary.userCount, 0);
    assert.equal(clearedSummary.guessCount, 0);
    assert.deepEqual(clearedSummary.userNames, []);
    assert.deepEqual(clearedSummary.guessNames, []);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});
