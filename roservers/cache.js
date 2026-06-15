// RoServers — cache.js (M4)
// Persistent IP/region cache keyed by server (job) ID, backed by
// chrome.storage.local with an in-memory layer on top.
//
// Why cache: a server's datacenter IP is stable for its lifetime, so once
// resolved we never need to call the rate-limited join API for it again.
// Entries carry a timestamp so stale ones (servers that died long ago) can be
// expired, keeping storage from growing without bound.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersCache = api;
  }
})(this, function () {
  "use strict";

  const PREFIX = "ro_srv_"; // storage key prefix per server
  const TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

  // In-memory mirror so repeated lookups in one session skip storage I/O.
  const mem = new Map();

  function keyFor(serverId) {
    return PREFIX + serverId;
  }

  // storageArea defaults to chrome.storage.local but is injectable for tests.
  function makeCache(storageArea) {
    const area =
      storageArea ||
      (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);

    async function get(serverId) {
      // Memory first.
      if (mem.has(serverId)) {
        const v = mem.get(serverId);
        if (!isExpired(v)) return strip(v);
        mem.delete(serverId);
      }
      if (!area) return undefined;
      const key = keyFor(serverId);
      const obj = await area.get(key);
      const v = obj && obj[key];
      if (!v) return undefined;
      if (isExpired(v)) {
        await area.remove(key);
        return undefined;
      }
      mem.set(serverId, v);
      return strip(v);
    }

    async function set(serverId, value) {
      const stored = { ip: value.ip, region: value.region, t: Date.now() };
      mem.set(serverId, stored);
      if (!area) return;
      await area.set({ [keyFor(serverId)]: stored });
    }

    // Wipe every cached server entry (memory + storage).
    async function clearAll() {
      mem.clear();
      if (!area || !area.getBigKeys) {
        // chrome.storage.local: enumerate keys with our prefix and remove them.
        if (area && typeof area.get === "function") {
          const all = await area.get(null);
          const keys = Object.keys(all || {}).filter((k) => k.startsWith(PREFIX));
          if (keys.length && area.remove) await area.remove(keys);
          return keys.length;
        }
      }
      return 0;
    }

    return { get, set, clearAll };
  }

  function isExpired(v) {
    return !v || typeof v.t !== "number" || Date.now() - v.t > TTL_MS;
  }
  // Return just the useful fields, not the timestamp.
  function strip(v) {
    return { ip: v.ip, region: v.region };
  }

  return { makeCache, _internals: { keyFor, isExpired, PREFIX, TTL_MS, mem } };
});
