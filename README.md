# Age Pool Tracker

Small web app for a private home network with three tabs:

- `User`: public form for `(first name, age)` entries with duplicate-name protection and a running age total.
- `Guess`: public form for `(first name, estimated-total-age)` entries with duplicate-name protection and a running guess total.
- `Admin`: password-protected dashboard with descending tables, accumulated age, and the participant whose guess is closest to the real total.

## Run locally

```powershell
$env:ADMIN_PASSWORD="choose-a-strong-password"
.\start-lan.ps1
```

Open:

- `http://localhost:3000`
- `http://<your-computer-lan-ip>:3000`

## Deploy on your private home network

1. Pick one computer on the network to host the app.
2. Install Node.js 18 or newer on that machine.
3. In PowerShell on that machine, set a real admin password and start the server:

```powershell
$env:ADMIN_PASSWORD="replace-this-password"
$env:SESSION_SECRET="replace-this-with-a-long-random-string"
.\start-lan.ps1
```

4. Allow inbound traffic to port `3000` on the host computer's private/home firewall profile.
5. From phones, tablets, or laptops on the same network, visit `http://<host-lan-ip>:3000`.

## Notes

- Data persists in [`data/store.json`](./data/store.json).
- Names are treated case-insensitively for duplicate detection inside each tab.
- Default admin password is `admin123` only if `ADMIN_PASSWORD` is not set. Change it before network use.
