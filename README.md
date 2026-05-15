# nba-playoff2026

Interactive NBA playoff dashboard with live scoreboard, standings, and prediction cards.

## Run locally

```bash
npm start
```

The server listens on:

- `http://localhost:3000`
- `http://<your-lan-ip>:3000`

You can override the bind host or port if needed:

```bash
$env:HOST="0.0.0.0"
$env:PORT="3000"
npm start
```

## Deploy on your network

1. Start the app with `npm start`.
2. Keep port `3000` open on the machine firewall if other devices need access.
3. Visit `http://<machine-ip>:3000` from another device on the same network.
4. Use `http://<machine-ip>:3000/health` for a simple health check.

The UI will fall back to demo data if the live ESPN feeds are unavailable.
