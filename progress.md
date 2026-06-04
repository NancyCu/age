Original prompt: now show me a working test. also make available on network. show me how the game works and what to do

- Verified `npm test` passes and the live server is reachable on LAN.
- Added a polished `/instructions` page with guest and host steps plus live URL labels.
- Linked the main landing page hero to `/instructions` and `/host`.
- Kept Playwright screenshots out of the commit scope because they are generated artifacts.

TODO
- If the admin password changes from `test-admin`, update the instructions page copy to match.
