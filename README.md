# Age Pool Tracker

LAN-hosted party game for the 6/6 Party Bash. Guests enter their age, then guess the total sum of all guest ages. The closest guess wins.

## Game Flow

- `My Age`: guests enter a `(first name, age)` pair once.
- `Sum of Ages`: guests enter a `(first name, total-age guess)` pair using a name that already exists in `My Age`.
- `Admin`: the host signs in to see totals, disable/enable guesses, reset the game, and control the winner board.

## Admin Controls

- Open `http://<host-lan-ip>:3000/host` for the Android-friendly live host dashboard.
- `Touch Down`: reveal the real closest guess.
- `Mask Winner`: show the fake winner name.
- `Hide Winner`: return the reveal board to its hidden state.
- `Disable Guess Tab`: stop guests from submitting more guesses. Use `Enable Guess Tab` to reopen guessing.

## Run Locally

```bash
ADMIN_PASSWORD="choose-a-strong-password" \
SESSION_SECRET="replace-this-with-a-long-random-string" \
npm start
```

Open:

- `http://localhost:3000`
- `http://<your-computer-lan-ip>:3000`
- `http://<your-computer-lan-ip>:3000/host` for the host phone dashboard

## Windows LAN Start

```powershell
$env:ADMIN_PASSWORD="choose-a-strong-password"
$env:SESSION_SECRET="replace-this-with-a-long-random-string"
.\start-lan.ps1
```

Allow inbound traffic to port `3000` on the host computer's private/home firewall profile. Guests on the same Wi-Fi can then visit `http://<host-lan-ip>:3000`. The host can use `http://<host-lan-ip>:3000/host` on an Android phone for a live control dashboard.

## Optional Firebase Realtime Database Storage

The app uses local `data/store.json` by default so it works before Firebase is set up.

The countdown app uses Firebase project `shawncountdown` and Realtime Database URL `https://shawncountdown-default-rtdb.firebaseio.com`. Age-Game can use that same database while staying separate under:

```text
ageGames/<FIREBASE_GAME_ID>/store
```

That keeps it away from the countdown app's existing paths such as `sharePreviews`, `adminImages`, `adminImageLibrary`, `adminImageFingerprints`, and `adminHiddenTemplates`.

1. Confirm the host machine is logged into Firebase CLI:

```bash
firebase login
```

2. Check the Firebase CLI setup:

```bash
DATA_BACKEND=firebase-cli \
FIREBASE_PROJECT_ID="shawncountdown" \
FIREBASE_GAME_ID="party-bash-2026" \
FIREBASE_DATA_ROOT="ageGames" \
npm run check:firebase
```

3. Start the app with Firebase CLI storage enabled:

```bash
DATA_BACKEND=firebase-cli \
FIREBASE_PROJECT_ID="shawncountdown" \
FIREBASE_GAME_ID="party-bash-2026" \
FIREBASE_DATA_ROOT="ageGames" \
ADMIN_PASSWORD="choose-a-strong-password" \
SESSION_SECRET="replace-this-with-a-long-random-string" \
npm start
```

Admin SDK mode is also supported if you prefer service-account credentials:

```bash
npm install firebase-admin
DATA_BACKEND=firebase \
FIREBASE_PROJECT_ID="shawncountdown" \
FIREBASE_SERVICE_ACCOUNT_PATH="/absolute/path/to/service-account.json" \
FIREBASE_GAME_ID="party-bash-2026" \
FIREBASE_DATA_ROOT="ageGames" \
npm run check:firebase
```

Useful variables:

- `DATA_BACKEND=local` uses `data/store.json`.
- `DATA_BACKEND=firebase-cli` uses the logged-in Firebase CLI.
- `DATA_BACKEND=firebase` uses the Firebase Admin SDK and service-account/Application Default Credentials.
- `FIREBASE_DATABASE_URL` defaults to `https://shawncountdown-default-rtdb.firebaseio.com`.
- `FIREBASE_DATA_ROOT` defaults to `ageGames`.
- `FIREBASE_GAME_ID` defaults to `age-pool-tracker`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` can be used instead of `FIREBASE_SERVICE_ACCOUNT_PATH`.

## Notes

- Requires Node.js 18 or newer.
- Data persists in `data/store.json`.
- `data/store.json` is ignored by Git so real party data does not get committed.
- Firebase service account files are ignored by Git.
- Names are treated case-insensitively for duplicate detection.
- Default admin password is `admin3462` only if `ADMIN_PASSWORD` is not set. Set a real password before LAN use.

## Verify

```bash
npm test
git diff --check
```
