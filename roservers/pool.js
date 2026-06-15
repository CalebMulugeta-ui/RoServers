// RoServers — pool.js (M4)
// Turns the single-server resolve (M3) into a safe batch operation that won't
// trip Roblox's join-game-instance rate limit.
//
// Three protections:
//   1. Throttle  — a delay between calls so we never burst.
//   2. Concurrency cap — at most N calls in flight at once.
//   3. Cache — IP->region for a server is stable, so a resolved server is never
//      re-fetched. The cache is passed in (M4 wires it to chrome.storage), so
//      this module stays pure and testable.
//
// The pool also supports an early-stop callback: the caller (M5) can say "I have
// enough regions, stop resolving" to avoid unnecessary API calls.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersPool = api;
  }
})(this, function () {
  "use strict";

  const DEFAULTS = {
    delayMs: 350,      // gap between starting calls
    concurrency: 2,    // max simultaneous in-flight calls
    maxResolves: 40,   // hard cap on API calls per run (cache hits don't count)
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // resolveOne: async (placeId, serverId) => { serverId, ip, region }
  // cache:      { get(serverId), set(serverId, value) } — sync or async ok
  // options:    { delayMs, concurrency, maxResolves, shouldStop, onResult }
  //
  // Returns an array of results in completion order (cached + freshly resolved).
  async function resolveBatch(placeId, servers, resolveOne, cache, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const results = [];
    let apiCalls = 0;
    let index = 0;
    let stopped = false;

    async function getCached(serverId) {
      if (!cache) return undefined;
      return await cache.get(serverId);
    }
    async function putCache(serverId, value) {
      if (cache && value) await cache.set(serverId, value);
    }

    // Worker pulls servers off the shared index until exhausted or stopped.
    async function worker() {
      while (true) {
        if (stopped) return;
        const i = index++;
        if (i >= servers.length) return;

        const server = servers[i];
        const sid = server.id;

        // Cache hit: no API call.
        const cached = await getCached(sid);
        if (cached !== undefined && cached !== null) {
          const result = { serverId: sid, ...cached, cached: true, server };
          results.push(result);
          if (opts.onResult) opts.onResult(result);
          if (opts.shouldStop && opts.shouldStop(results)) stopped = true;
          continue;
        }

        // Respect the API-call budget.
        if (apiCalls >= opts.maxResolves) {
          stopped = true;
          return;
        }
        apiCalls++;

        // Throttle: stagger the start of each network call.
        if (opts.delayMs) await sleep(opts.delayMs);

        try {
          const r = await resolveOne(placeId, sid);
          await putCache(sid, { ip: r.ip, region: r.region });
          const result = { ...r, cached: false, server };
          results.push(result);
          if (opts.onResult) opts.onResult(result);
          if (opts.shouldStop && opts.shouldStop(results)) stopped = true;
        } catch (err) {
          const result = { serverId: sid, ip: null, region: null, error: String((err && err.message) || err), server };
          results.push(result);
          if (opts.onResult) opts.onResult(result);
          // On a rate-limit error, stop the whole run — pushing harder makes it
          // worse. Caller can retry later.
          if (result.error && result.error.includes("429")) stopped = true;
        }
      }
    }

    const workers = [];
    const n = Math.max(1, Math.min(opts.concurrency, servers.length));
    for (let w = 0; w < n; w++) workers.push(worker());
    await Promise.all(workers);

    return results;
  }

  return { resolveBatch, DEFAULTS };
});
