# RoServers

**Choose which Roblox server you join — by region and ping.**

RoServers is a Chrome extension that gives you control over Roblox's server matchmaking. Instead of being dropped into whatever server Roblox picks, you can browse a game's active servers grouped by real-world region, see the estimated ping and player count for each, and join a specific server directly.

![RoServers region browser](submission/screenshot-1-regions.png)

---

## Features

- **Browse servers by region** — every active server, grouped by location: North America, Europe, South America, Asia, and Oceania.
- **Ping estimates** — each server shows a ping, color-coded (green / yellow / red) so the best connections stand out.
- **Live server info** — see player counts and the avatars of players already in a server before you join.
- **Direct server join** — jump straight into a chosen server, skipping the matchmaker.
- **Pinned regions** — star your favorite regions to keep them at the top, persisted across sessions.
- **Fast and local** — results are cached on your device; there's no account and no backend.

---

## How it works

RoServers is built on Manifest V3. The flow:

1. **Server list** — reads a game's public server list from Roblox's `games.roblox.com` API.
2. **Region resolution** — for each server, queries Roblox's `gamejoin.roblox.com` join-instance endpoint to get the server's public IP, then matches that IP against a bundled table of Roblox datacenter IP ranges to determine its city/region.
3. **Ping estimate** — looks up the user's approximate location once (via `ipapi.co`) and estimates ping to each region by great-circle distance, falling back to the server's reported average ping where available.
4. **Join** — injects a small page-context script that calls Roblox's own `Roblox.GameLauncher.joinGameInstance(placeId, serverId)` to launch the chosen server.

Because Manifest V3 content scripts can't make the needed cross-origin requests, all network calls happen in the background service worker. Region resolution is throttled, batched, and cached to stay within Roblox's rate limits.

---

## Project structure

```
roservers/
├── manifest.json        # MV3 manifest
├── content.js           # Injects the button; bridges page-context join
├── injector.js          # Page-context script that calls Roblox's launcher
├── ui.js                # The two-pane region-picker popup
├── welcome.js           # First-run onboarding screen
├── background.js        # Service worker: fetches, DNR rule, batch resolution
├── servers.js           # Server-list fetch + pagination
├── resolve.js           # Single server -> IP -> region
├── pool.js              # Throttled, cached batch resolver
├── cache.js             # chrome.storage-backed region cache
├── userloc.js           # Cached approximate-location lookup
├── geo.js               # CIDR matching + distance/ping estimation
├── regions.js           # Bundled datacenter IP ranges + coordinates
├── content.css          # Styles (the "network atlas" design)
├── popup.html / popup.js# Toolbar popup (clear cache, info)
├── icons/               # Extension icons (16/48/128)
└── *.test.js            # Node test suites (not shipped in the build)
```

---

## Development

The non-UI modules are written to run both in the browser and under Node, so the logic is testable without a browser.

```bash
# Run a test suite
node geo.test.js
node servers.test.js
node resolve.test.js
node pool.test.js
node cache.test.js
node userloc.test.js
```

### Loading the extension locally

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `roservers/` folder.
4. Open any Roblox game page and click the globe button next to Play.

### Building a release zip

Package the runtime files only (exclude tests and dev sources):

```bash
zip -r roservers.zip roservers -x "roservers/*.test.js" -x "roservers/submission/*" -x "roservers/*.svg"
```

---

## Privacy

RoServers does not collect, store on any server, sell, or share personal data. Everything runs locally:

- It contacts Roblox's public endpoints to read server data and join servers.
- It uses `ipapi.co` for a one-time, cached lookup of your approximate location, used only to estimate ping.
- Pinned regions, the location result, and the server-region cache are stored in `chrome.storage.local` on your device.

See [`submission/privacy-policy.html`](submission/privacy-policy.html) for the full policy.

---

## Caveats & limitations

- **Ping is an estimate, not a measurement.** Browsers can't perform a true network ping to a game server. RoServers estimates by region distance and shows the server's reported average where available.
- **Region data can go stale.** The bundled datacenter IP table is a snapshot; Roblox occasionally adds or shifts ranges, so a small number of servers may show as unknown until the table is updated. (The toolbar popup includes a "clear cache" option.)
- **Depends on Roblox's internal APIs.** RoServers relies on Roblox endpoints that aren't officially documented for third-party use. Roblox can change them at any time, which may temporarily break the extension until it's updated.
- **Roblox desktop client required.** Joining a server launches the Roblox client, the same as the normal Play button.

---

## Disclaimer

RoServers is an independent project and is **not affiliated with, endorsed by, or sponsored by Roblox Corporation**. "Roblox" is a trademark of Roblox Corporation.

---

## License

[Choose a license — e.g. MIT — and add a LICENSE file. See https://choosealicense.com]
