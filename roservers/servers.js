// RoServers — servers.js (M2)
// Fetches the public server list for a place from Roblox's games API and
// normalizes it. Kept free of DOM code so the parsing logic is testable.
//
// Endpoint:
//   GET https://games.roblox.com/v1/games/{placeId}/servers/Public
//       ?sortOrder=Desc&limit=50&cursor={cursor}
//
// Live API quirks handled here (observed 2025–2026, Roblox DevForum):
//   - limit=100 currently returns empty data; 50/25/10 work. We use 50.
//   - nextPageCursor can go null after ~700 servers even if more exist; we also
//     impose our own page cap so we never loop unbounded.
//
// Each raw server object looks like:
//   { id, maxPlayers, playing, playerTokens:[...], players:[...], fps, ping }
// where `ping` is the average ping of players ALREADY in that server, and `id`
// is the server (job) UUID used later to resolve region and to join.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersList = api;
  }
})(this, function () {
  "use strict";

  const API_BASE = "https://games.roblox.com/v1/games";
  const PAGE_LIMIT = 50; // 100 currently returns empty data; 50 is safe.
  const MAX_PAGES = 20; // hard safety cap (~1000 servers) to avoid runaway loops.

  // Extract placeId from a Roblox game URL path: /games/{placeId}/{name}
  function placeIdFromUrl(url) {
    const m = String(url).match(/\/games\/(\d+)/);
    return m ? m[1] : null;
  }

  // Normalize one raw server object into the shape the rest of the app uses.
  function normalizeServer(raw) {
    return {
      id: raw.id, // server/job UUID
      playing: raw.playing ?? 0,
      maxPlayers: raw.maxPlayers ?? 0,
      fps: raw.fps ?? null,
      avgPing: raw.ping ?? null, // avg ping of players in-server (not the user's)
      playerTokens: Array.isArray(raw.playerTokens) ? raw.playerTokens : [],
    };
  }

  // Build the request URL for a given page.
  function buildUrl(placeId, cursor) {
    let url = `${API_BASE}/${placeId}/servers/Public?sortOrder=Desc&limit=${PAGE_LIMIT}&excludeFullGames=false`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    return url;
  }

  // Parse a raw API JSON response into { servers, nextCursor }.
  // Defensive against missing/empty data so callers don't crash.
  function parsePage(json) {
    const data = Array.isArray(json?.data) ? json.data : [];
    return {
      servers: data.map(normalizeServer),
      nextCursor: json?.nextPageCursor || null,
    };
  }

  // Fetch every page (up to MAX_PAGES) and return a flat, normalized list.
  // `fetchImpl` is injectable so tests can run without a network.
  async function fetchAllServers(placeId, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const all = [];
    let cursor = null;
    let pages = 0;

    do {
      const res = await doFetch(buildUrl(placeId, cursor), {
        method: "GET",
        headers: { Accept: "application/json" },
        // The background worker is allowed to send credentials cross-origin
        // (host_permissions grants it). Some Roblox endpoints reject anonymous
        // requests, so include rather than omit.
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Roblox server list HTTP ${res.status} ${res.statusText || ""}`.trim());
      }
      const json = await res.json();
      const { servers, nextCursor } = parsePage(json);
      all.push(...servers);
      cursor = nextCursor;
      pages++;
    } while (cursor && pages < MAX_PAGES);

    return all;
  }

  return {
    placeIdFromUrl,
    normalizeServer,
    buildUrl,
    parsePage,
    fetchAllServers,
    _constants: { PAGE_LIMIT, MAX_PAGES },
  };
});
