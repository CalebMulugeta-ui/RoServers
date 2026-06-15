// RoServers — resolve.js (M3)
// Resolves a single Roblox server (job) ID to its public IP address by calling
// the gamejoin API, then maps that IP to a region using geo.js.
//
// This is the fragile part of the whole extension:
//   - The join-game-instance endpoint rejects normal browser User-Agents, so a
//     declarativeNetRequest rule (set up in background.js) rewrites the UA to
//     "Roblox/WinInet" for requests to gamejoin.roblox.com only.
//   - The endpoint is aggressively rate-limited, so M4 adds batching + caching.
//     M3 deliberately resolves just ONE server to prove the mechanism works.
//
// Response shape (relevant part):
//   { joinScript: {
//       MachineAddress: "10.x.x.x",          // internal — ignore
//       UdmuxEndpoints: [{ Address: "128.116.97.33", Port: ... }]  // public IP
//   } }

(function (root, factory) {
  const geo =
    typeof module !== "undefined" && module.exports
      ? require("./geo.js")
      : self.RoServersGeo;
  const api = factory(geo);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersResolve = api;
  }
})(this, function (geo) {
  "use strict";

  const JOIN_URL = "https://gamejoin.roblox.com/v1/join-game-instance";

  // Pull the public IP out of a join-game-instance response.
  // Prefers UdmuxEndpoints (the real datacenter IP); ignores the 10.x
  // MachineAddress which is internal and not region-identifying.
  function extractPublicIp(json) {
    const js = json && json.joinScript;
    if (!js) return null;
    const udmux = Array.isArray(js.UdmuxEndpoints) ? js.UdmuxEndpoints : [];
    for (const ep of udmux) {
      if (ep && ep.Address && !ep.Address.startsWith("10.")) {
        return ep.Address;
      }
    }
    return null;
  }

  function buildBody(placeId, serverId) {
    return {
      placeId: Number(placeId),
      isTeleport: "False",
      gameId: serverId,
      gameJoinAttemptId: serverId,
    };
  }

  // Resolve one server -> { ip, region } (region may be null if IP unknown).
  // Throws on HTTP error so the caller can surface/handle it (incl. 429s).
  // `fetchImpl` is injectable for tests.
  async function resolveServer(placeId, serverId, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const res = await doFetch(JOIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The DNR rule injects User-Agent: Roblox/WinInet for this endpoint.
      body: JSON.stringify(buildBody(placeId, serverId)),
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`join-game-instance HTTP ${res.status}`);
    }

    const json = await res.json();
    const ip = extractPublicIp(json);
    const region = ip ? geo.ipToRegion(ip) : null;
    return { serverId, ip, region };
  }

  return { resolveServer, extractPublicIp, buildBody, JOIN_URL };
});
