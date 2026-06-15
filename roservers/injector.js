// RoServers — injector.js (M6)
// Runs in the PAGE's JavaScript context (not the content script's isolated
// world), so it can reach Roblox's own globals. Its only job: listen for a
// join request from the content script and call Roblox's launcher.
//
// Roblox exposes Roblox.GameLauncher.joinGameInstance(placeId, gameId) which
// launches the desktop client into a specific server instance. That global is
// only visible to page-context scripts, which is why this file exists and is
// injected via a <script> tag / web_accessible_resource rather than running as
// a content script.

(function () {
  "use strict";

  window.addEventListener("message", function (event) {
    // Only accept messages from this same window with our marker.
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__roservers !== true || data.type !== "JOIN") return;

    const placeId = Number(data.placeId);
    const serverId = data.serverId;

    try {
      if (
        window.Roblox &&
        window.Roblox.GameLauncher &&
        typeof window.Roblox.GameLauncher.joinGameInstance === "function"
      ) {
        window.Roblox.GameLauncher.joinGameInstance(placeId, serverId);
        postBack({ ok: true });
      } else {
        postBack({ ok: false, error: "Roblox.GameLauncher.joinGameInstance unavailable" });
      }
    } catch (err) {
      postBack({ ok: false, error: String((err && err.message) || err) });
    }
  });

  function postBack(result) {
    window.postMessage(
      { __roservers: true, type: "JOIN_RESULT", ok: result.ok, error: result.error || null },
      "*"
    );
  }
})();
