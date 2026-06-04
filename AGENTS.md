# AGENTS.md

## Purpose
This repo is a small LAN-hosted Node and vanilla JavaScript app called **Age Pool Tracker**. It collects participant names and ages, collects guesses for the total age, and gives an admin a private dashboard for totals, guess controls, and winner reveal.

An agent working in this repo should preserve three things above all:
- The public User and Guess flows for party participants.
- The admin-only dashboard and session-protected controls.
- The local data model stored in `data/store.json`.

## Product Summary
The app helps a host run an age-total guessing game on a private home network:
- Participants enter a first name and age in the User tab.
- Participants submit guesses using an existing first name from the User tab.
- Duplicate names are blocked case-insensitively inside each flow.
- Admin can log in, view sorted entries, toggle guessing, reveal the real winner, show a fake winner, hide the winner board, and clear all entries.
- Host can use `/host` on an Android phone for live data and big admin controls.
- Data persists locally between server restarts.

## Stack
- Runtime: Node.js 18 or newer.
- Server: built-in `http` module in `server.js`.
- Frontend: static `index.html`, `styles.css`, and `app.js`.
- Host mobile dashboard: static `host.html` and `host.js`.
- Optional Firebase persistence: Realtime Database when `DATA_BACKEND=firebase-cli` or `DATA_BACKEND=firebase`.
- `DATA_BACKEND=firebase-cli` uses the logged-in Firebase CLI and is the current no-service-account path.
- `DATA_BACKEND=firebase` uses the Firebase Admin SDK; install `firebase-admin` only when Firebase credentials are actually ready.
- Firebase setup helper: `npm run check:firebase`.
- Tests: Node's built-in test runner with `node --test`.

## Runtime Model
- `npm start` runs `node server.js`.
- The server binds to `0.0.0.0` by default so other devices on the LAN can connect.
- Public static files are restricted by the `staticFiles` set in `server.js`.
- API routes live in `server.js` and read/write `data/store.json`.
- `data/store.json` is runtime state and is intentionally ignored by Git.
- `data/.gitkeep` only keeps the data directory present in fresh clones.

## Route Map
- `GET /` -> serves `index.html`.
- `GET /host` -> serves the Android-friendly host dashboard.
- `GET /health` -> returns service health.
- `GET /api/summary` -> public totals and participant/guess metadata.
- `POST /api/users` -> create a user age entry.
- `POST /api/guesses` -> create a guess for an existing user name.
- `POST /api/admin/login` -> create admin session cookie.
- `POST /api/admin/logout` -> clear admin session cookie.
- `GET /api/admin/session` -> report admin auth state.
- `GET /api/admin/events` -> authenticated Server-Sent Events stream for live host dashboard updates.
- `GET /api/admin/dashboard` -> admin dashboard payload.
- `POST /api/admin/guess-tab` -> enable or disable public guessing.
- `POST /api/admin/winner-mode` -> set winner board to `hidden`, `real`, or `fake`.
- `POST /api/admin/reveal-winner` -> backward-compatible real/hidden winner endpoint.
- `POST /api/admin/clear` -> clear users and guesses.

## High-Risk Areas
- `server.js`: route contracts, validation, sessions, local persistence, LAN binding, and admin behavior.
- `app.js`: browser event flow, tab state, public/admin rendering, and API calls.
- `host.js` and `host.html`: Android-friendly live host dashboard and admin controls.
- `styles.css`: responsive layout and readability for phones on a home network.
- `test/server.test.js`: end-to-end API coverage for user, guess, duplicate, admin, toggle, reveal, and clear flows.

## Legacy / Out Of Scope

- `components/Prediction*.js` and `lib/*prediction*` / betting files are unrelated to the Age Pool party game and should not be wired into this app unless Michael explicitly asks for a post-party cleanup or rewrite.

## Editing Rules
- Keep the app dependency-light. Prefer the existing plain Node/static JS structure unless the user explicitly asks for a framework.
- Preserve API response shapes unless every browser consumer and test is updated together.
- Preserve duplicate-name behavior: names are normalized, compared case-insensitively, and trimmed.
- Preserve the rule that a guess name must already exist in the User tab.
- Preserve admin protection for dashboard, clear, guess toggle, and winner reveal routes.
- Do not commit `data/store.json`, personal event data, real participant lists, or local secrets.
- Do not hardcode new private passwords, real session secrets, LAN IPs, or machine-specific paths.
- Do not commit Firebase service account JSON files.
- Keep local JSON mode working even when Firebase is not configured.
- Use the same Firebase Realtime Database as the countdown app only under the separate `ageGames/<FIREBASE_GAME_ID>/store` path.
- Do not write to countdown app paths such as `sharePreviews`, `adminImages`, `adminImageLibrary`, `adminImageFingerprints`, or `adminHiddenTemplates`.
- Keep static asset routing intentional. If a new browser file is needed, add it to the `staticFiles` allowlist and verify it loads.
- Avoid broad rewrites. Make small, testable changes that protect the party-day workflow.
- Do not push, deploy, or expose the app outside the local machine/LAN unless Michael explicitly asks.

## Security And Privacy
- Set `ADMIN_PASSWORD` before any real LAN use.
- Set `SESSION_SECRET` before any real LAN use.
- For Firebase CLI mode, set `DATA_BACKEND=firebase-cli`, `FIREBASE_PROJECT_ID=shawncountdown`, and an isolated `FIREBASE_GAME_ID`.
- For Firebase Admin SDK mode, set `DATA_BACKEND=firebase` plus Firebase service-account environment variables.
- Use `.env.example` as the setup template; do not commit a real `.env` or service account.
- Treat all submitted names and ages as private event data.
- Keep cookies `HttpOnly` and `SameSite=Strict` unless there is a concrete reason to change them.
- Be careful with changes that affect LAN hosting, firewall assumptions, or public exposure.

## Verification
- Run `npm test` after any server, API, data model, validation, session, or admin change.
- Run `git diff --check` before handing off code changes.
- For UI changes, start the app with `npm start` and inspect `http://localhost:3000` in a browser.
- For real LAN testing, use a non-secret test password and verify from at least one phone or second device on the same network.

## Handoff Notes
- Report the current branch and changed files.
- Mention which verification commands passed.
- Mention if browser/LAN verification was skipped.
- Keep finish-line reports short and practical.
