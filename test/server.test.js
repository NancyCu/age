const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const dataFile = path.join(projectRoot, "data", "store.json");

async function resetStore() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(
    dataFile,
    JSON.stringify(
      {
        guesses: [],
        users: []
      },
      null,
      2
    )
  );
}

test("user, guess, duplicate, and admin flows work", async () => {
  process.env.ADMIN_PASSWORD = "secretpw";
  process.env.SESSION_SECRET = "test-session-secret";

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
    assert.equal(dashboard.guessTotal, 34);
    assert.equal(dashboard.users[0].name, "Nora");
    assert.equal(dashboard.guesses[0].name, "Alice");
    assert.equal(dashboard.nearestGuess.name, "Alice");
    assert.equal(dashboard.nearestGuess.difference, 82);

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
      guessCount: 0,
      guessNames: [],
      guessTotal: 0,
      userCount: 0,
      userNames: [],
      userTotal: 0
    });
    assert.equal(cleared.dashboard.accumulatedAge, 0);
    assert.equal(cleared.dashboard.guessTotal, 0);
    assert.equal(cleared.dashboard.nearestGuess, null);
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
