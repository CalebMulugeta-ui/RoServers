// RoServers — userloc.js (M5)
// Determines the user's approximate coordinates once (for ping estimation) and
// caches them in chrome.storage.local. Location rarely changes, so we refresh
// only weekly. Uses ipapi.co/json/ (no API key, free tier) and reads just the
// latitude/longitude — nothing is sent anywhere; it's a GET on the user's own IP.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    self.RoServersUserLoc = api;
  }
})(this, function () {
  "use strict";

  const STORAGE_KEY = "ro_user_loc";
  const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
  const ENDPOINT = "https://ipapi.co/json/";

  // Returns { coords: [lat, lon], city, country } or null if unavailable.
  // storageArea + fetchImpl injectable for tests.
  async function getUserLocation(storageArea, fetchImpl) {
    const area =
      storageArea ||
      (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local);
    const doFetch = fetchImpl || fetch;

    // Cached?
    if (area) {
      const obj = await area.get(STORAGE_KEY);
      const v = obj && obj[STORAGE_KEY];
      if (v && typeof v.t === "number" && Date.now() - v.t < TTL_MS) {
        return { coords: v.coords, city: v.city, country: v.country };
      }
    }

    // Fetch fresh.
    try {
      const res = await doFetch(ENDPOINT, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const json = await res.json();
      const lat = Number(json.latitude);
      const lon = Number(json.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const value = {
        coords: [lat, lon],
        city: json.city || null,
        country: json.country_name || json.country || null,
        t: Date.now(),
      };
      if (area) await area.set({ [STORAGE_KEY]: value });
      return { coords: value.coords, city: value.city, country: value.country };
    } catch (e) {
      return null;
    }
  }

  return { getUserLocation, _internals: { STORAGE_KEY, TTL_MS, ENDPOINT } };
});
