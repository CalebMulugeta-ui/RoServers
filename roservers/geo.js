// RoServers — geo.js (M1)
// Pure lookup logic. No browser APIs, no network — fully unit-testable.
//
// Responsibilities:
//   - ipToRegion(ip): given a server's public IP, return the matching region
//     object (or null if no CIDR contains it).
//   - regionById(id): fetch a region by its id.
//   - haversineKm(a, b): great-circle distance between two [lat, lon] points,
//     used by M5 to estimate latency by proximity.

(function (root, factory) {
  const regionsModule =
    typeof module !== "undefined" && module.exports
      ? require("./regions.js")
      : self.RoServersRegions;
  const api = factory(regionsModule.REGIONS);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersGeo = api;
  }
})(this, function (REGIONS) {
  "use strict";

  // Convert a dotted IPv4 string to a 32-bit unsigned integer.
  function ipToInt(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      const o = Number(p);
      if (!Number.isInteger(o) || o < 0 || o > 255) return null;
      n = (n << 8) | o;
    }
    // >>> 0 forces unsigned 32-bit.
    return n >>> 0;
  }

  // Parse "a.b.c.d/p" into { base, mask } as unsigned 32-bit ints.
  function parseCidr(cidr) {
    const [addr, prefixStr] = cidr.split("/");
    const prefix = Number(prefixStr);
    const base = ipToInt(addr);
    if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return null;
    }
    // mask for prefix bits. prefix===0 -> 0 mask; handle 32 cleanly.
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return { base: (base & mask) >>> 0, mask };
  }

  // Pre-parse every CIDR once so lookups are cheap.
  const INDEX = [];
  for (const region of REGIONS) {
    for (const cidr of region.cidrs) {
      const parsed = parseCidr(cidr);
      if (parsed) INDEX.push({ region, base: parsed.base, mask: parsed.mask });
    }
  }

  function ipToRegion(ip) {
    const n = ipToInt(ip);
    if (n === null) return null;
    for (const entry of INDEX) {
      if (((n & entry.mask) >>> 0) === entry.base) return entry.region;
    }
    return null;
  }

  function regionById(id) {
    return REGIONS.find((r) => r.id === id) || null;
  }

  // Great-circle distance in km between [lat, lon] points.
  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Estimate round-trip latency (ms) from a user coordinate to a datacenter
  // coordinate. Rough model: signal travels ~200km/ms round-trip through fiber
  // (≈2/3 c, doubled for the round trip), plus a fixed overhead for routing,
  // queuing, and last-mile. This is an ESTIMATE for ranking, not a measurement.
  function estimatePingMs(userCoords, dcCoords) {
    if (!userCoords || !dcCoords) return null;
    const km = haversineKm(userCoords, dcCoords);
    const OVERHEAD_MS = 10;
    const KM_PER_MS_RTT = 100; // ~100 km of distance per 1ms of round-trip time
    return Math.round(OVERHEAD_MS + km / KM_PER_MS_RTT);
  }

  return { ipToRegion, regionById, haversineKm, estimatePingMs, REGIONS, _ipToInt: ipToInt };
});
