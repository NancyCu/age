const fs = require("fs");
const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");

function checkFirebaseSetup() {
  const problems = [];
  const backend = String(process.env.DATA_BACKEND || "local").toLowerCase();

  if (backend !== "firebase" && backend !== "firebase-cli") {
    console.log("DATA_BACKEND is not firebase. Local data mode is ready.");
    return;
  }

  const root = process.env.FIREBASE_DATA_ROOT || "ageGames";
  const gameId = process.env.FIREBASE_GAME_ID || "age-pool-tracker";
  const databaseURL = process.env.FIREBASE_DATABASE_URL || "https://shawncountdown-default-rtdb.firebaseio.com";

  if (backend === "firebase-cli") {
    try {
      execFileSync("firebase", ["database:get", `/${root}`, "--project", process.env.FIREBASE_PROJECT_ID || "shawncountdown", "--json"], {
        stdio: "ignore"
      });
      console.log(`Firebase CLI setup looks ready. Age-Game data will use ${databaseURL}/${root}/${gameId}/store.`);
      return;
    } catch {
      problems.push("Firebase CLI could not read the database. Run firebase login and confirm access to project shawncountdown.");
      console.error("Firebase CLI setup is not ready:");
      problems.forEach((problem) => console.error(`- ${problem}`));
      process.exitCode = 1;
      return;
    }
  }

  try {
    require.resolve("firebase-admin/app");
    require.resolve("firebase-admin/database");
  } catch {
    problems.push("Run npm install firebase-admin before using DATA_BACKEND=firebase.");
  }

  if (!process.env.FIREBASE_PROJECT_ID) {
    problems.push("Set FIREBASE_PROJECT_ID to shawncountdown or the target Firebase project id.");
  }

  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
  const hasApplicationDefaultCredentials = fs.existsSync(adcPath);

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !hasApplicationDefaultCredentials) {
    problems.push("Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON, or run gcloud auth application-default login.");
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(serviceAccountPath)) {
      problems.push(`Service account file not found: ${serviceAccountPath}`);
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      problems.push("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
  }

  if (problems.length) {
    console.error("Firebase Realtime Database setup is not ready:");
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Firebase setup variables look ready. Age-Game data will use ${databaseURL}/${root}/${gameId}/store.`);
}

checkFirebaseSetup();
