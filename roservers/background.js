// RoServers — background.js (M4)
// Service worker: cross-origin fetches, the User-Agent DNR rule, batch
// resolution with throttling + caching, and message handlers.

importScripts("regions.js", "geo.js", "servers.js", "resolve.js", "pool.js", "cache.js", "userloc.js");

// --- User-Agent rewrite rule (the fragile core, from M3) --------------------
const DNR_RULE_ID = 1;
const UA_RULE = {
  id: DNR_RULE_ID,
  priority: 1,
  action: {
    type: "modifyHeaders",
    requestHeaders: [
      { header: "User-Agent", operation: "set", value: "Roblox/WinInet" },
    ],
  },
  condition: {
    urlFilter: "||gamejoin.roblox.com/v1/join-game-instance",
    resourceTypes: ["xmlhttprequest"],
  },
};

async function installUaRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [UA_RULE],
    });
    console.log("[RoServers] User-Agent DNR rule installed.");
  } catch (e) {
    console.warn("[RoServers] failed to install UA rule:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[RoServers] installed — M4 active.");
  installUaRule();
});
chrome.runtime.onStartup.addListener(installUaRule);
installUaRule();

// --- Cache instance ---------------------------------------------------------
const cache = self.RoServersCache.makeCache();

// --- Message handlers -------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === "ROSERVERS_FETCH_SERVERS") {
    console.log("[RoServers] fetching servers for placeId", msg.placeId);
    self.RoServersList.fetchAllServers(msg.placeId)
      .then((servers) => {
        console.log("[RoServers] fetched", servers.length, "servers");
        sendResponse({ ok: true, servers });
      })
      .catch((err) => {
        console.warn("[RoServers] fetch error:", err);
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      });
    return true;
  }

  // M3: single resolve (kept for debugging).
  if (msg.type === "ROSERVERS_RESOLVE_ONE") {
    self.RoServersResolve.resolveServer(msg.placeId, msg.serverId)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  // M5: user location for ping estimation (cached, IP-based).
  if (msg.type === "ROSERVERS_GET_USER_LOCATION") {
    self.RoServersUserLoc.getUserLocation()
      .then((location) => sendResponse({ ok: true, location }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  // Avatar headshots: convert playerTokens -> image URLs via the thumbnails
  // batch API (same mechanism the Roblox site's own server list uses).
  if (msg.type === "ROSERVERS_FETCH_THUMBS") {
    const tokens = (msg.tokens || []).slice(0, 100); // API caps batches at 100
    const body = tokens.map((token) => ({
      requestId: token,
      type: "AvatarHeadShot",
      token,
      size: "48x48",
      format: "png",
      isCircular: true,
    }));
    fetch("https://thumbnails.roblox.com/v1/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`thumbnails HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        // Map token -> imageUrl for completed entries.
        const urls = {};
        for (const item of json?.data || []) {
          if (item.state === "Completed" && item.imageUrl) {
            urls[item.requestId] = item.imageUrl;
          }
        }
        sendResponse({ ok: true, urls });
      })
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  // M4: batch resolve with throttling + caching. Streams progress back to the
  // requesting tab so the popup can fill in regions as they arrive.
  if (msg.type === "ROSERVERS_RESOLVE_BATCH") {
    const tabId = sender && sender.tab && sender.tab.id;
    const resolveOne = (placeId, serverId) =>
      self.RoServersResolve.resolveServer(placeId, serverId);

    const onResult = (result) => {
      if (tabId != null) {
        // Strip the heavy `server` object before messaging; send the essentials.
        chrome.tabs.sendMessage(tabId, {
          type: "ROSERVERS_BATCH_PROGRESS",
          serverId: result.serverId || (result.server && result.server.id),
          ip: result.ip || null,
          regionId: result.region ? result.region.id : null,
          regionLabel: result.region ? result.region.label : null,
          cached: !!result.cached,
          error: result.error || null,
        }).catch(() => {}); // tab may have navigated away
      }
    };

    console.log("[RoServers] batch resolving", msg.servers.length, "servers");
    self.RoServersPool.resolveBatch(
      msg.placeId,
      msg.servers,
      resolveOne,
      cache,
      { onResult }
    )
      .then((results) => {
        const resolved = results.filter((r) => r.region).length;
        console.log("[RoServers] batch done:", resolved, "regions resolved of", results.length);
        sendResponse({ ok: true, count: results.length, resolved });
      })
      .catch((err) => {
        console.warn("[RoServers] batch error:", err);
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      });
    return true;
  }

  // M7: clear the server-region cache (from the toolbar popup).
  if (msg.type === "ROSERVERS_CLEAR_CACHE") {
    cache.clearAll()
      .then((n) => sendResponse({ ok: true, cleared: n }))
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  return false;
});
