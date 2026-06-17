# RoServers

**Choose which Roblox server you join — by region and ping.**

RoServers is a Chrome extension that gives you control over Roblox's server matchmaking. Instead of being dropped into whatever server Roblox picks, you can browse a game's active servers grouped by real-world region, see the estimated ping and player count for each, and join a specific server directly.

**You can download the chrome extension here**

https://chromewebstore.google.com/detail/roservers/jmhpnhjmjjdkjfllcchkangimpejbljg

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

## Privacy

Policy: https://calebmulugeta-ui.github.io/RoServers/privacy-policy.html

---

## Caveats & limitations

- **Ping is an estimate, not a measurement.** Browsers can't perform a true network ping to a game server. RoServers estimates by region distance and shows the server's reported average where available.
- **Region data can go stale.** The bundled datacenter IP table is a snapshot; Roblox occasionally adds or shifts ranges, so a small number of servers may show as unknown until the table is updated. (The toolbar popup includes a "clear cache" option.)
- **Depends on Roblox's internal APIs.** RoServers relies on Roblox endpoints that aren't officially documented for third-party use. Roblox can change them at any time, which may temporarily break the extension until it's updated.
- **Roblox desktop client required.** Joining a server launches the Roblox client, the same as the normal Play button.

---

## Disclaimer

RoServers is an independent project and is **not affiliated with, endorsed by, or sponsored by Roblox Corporation**. "Roblox" is a trademark of Roblox Corporation.

