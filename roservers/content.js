// RoServers — content.js (M0)
// Goal of this milestone: reliably inject a "Choose Server" button next to
// Roblox's Play button, surviving the client-side navigation that rebuilds
// the DOM. No network calls yet — the popup is a placeholder.

(() => {
  "use strict";

  const BUTTON_ID = "roservers-choose-btn";
  const POPUP_ID = "roservers-popup";

  // --- Page-context injector (M6) --------------------------------------------
  // Load injector.js into the PAGE world so it can call Roblox's launcher.
  // It's declared as a web_accessible_resource in the manifest.
  function injectPageScript() {
    if (document.getElementById("roservers-injector")) return;
    const s = document.createElement("script");
    s.id = "roservers-injector";
    s.src = chrome.runtime.getURL("injector.js");
    s.addEventListener("load", () => s.remove()); // tidy: tag can go once run
    (document.head || document.documentElement).appendChild(s);
  }
  injectPageScript();

  // First-run onboarding (shows once, tracked in storage).
  if (self.RoServersWelcome) self.RoServersWelcome.maybeShow();

  // Ask the page to join a specific server. Resolves/rejects on the page's reply.
  function joinServer(placeId, serverId) {
    return new Promise((resolve, reject) => {
      function onReply(event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.__roservers !== true || d.type !== "JOIN_RESULT") return;
        window.removeEventListener("message", onReply);
        if (d.ok) resolve();
        else reject(new Error(d.error || "Join failed"));
      }
      window.addEventListener("message", onReply);
      window.postMessage(
        { __roservers: true, type: "JOIN", placeId, serverId },
        "*"
      );
      // Safety timeout so the UI never hangs forever.
      setTimeout(() => {
        window.removeEventListener("message", onReply);
        reject(new Error("Join request timed out"));
      }, 8000);
    });
  }

  // Expose for ui.js.
  self.RoServersJoin = { joinServer };

  // --- Helpers ---------------------------------------------------------------

  // Roblox's Play button lives inside the game's purchase/play container.
  // The markup changes over time, so we look for a few stable-ish anchors
  // rather than one brittle selector. We return the element we want to insert
  // *after* (the play button's wrapper), or null if the page isn't ready.
  function findPlayButtonContainer() {
    // The play button itself most commonly carries this id or data attribute.
    const playBtn =
      document.getElementById("game-details-play-button-container") ||
      document.querySelector("[data-testid='play-button']") ||
      document.querySelector(".game-details-play-button-container") ||
      document.querySelector("#game-details-play-button-container button");

    if (!playBtn) return null;

    // Prefer inserting alongside the play button's container so layout matches.
    return playBtn.closest(
      "#game-details-play-button-container, .btn-common-play-game-lg, .game-details-play-button-container"
    ) || playBtn;
  }

  function currentPlaceId() {
    // URL form: https://www.roblox.com/games/{placeId}/{name}
    const m = location.pathname.match(/\/games\/(\d+)/);
    return m ? m[1] : null;
  }

  // --- Button ----------------------------------------------------------------

  function buildButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.className = "roservers-btn";
    btn.title = "Choose region";
    btn.setAttribute("aria-label", "Choose region");
    // Globe icon (inline SVG so it needs no external asset).
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M3 12h18"></path>
        <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path>
      </svg>`;
    btn.addEventListener("click", onChooseServerClick);
    return btn;
  }

  function injectButton() {
    // Guard: never create a second button.
    if (document.getElementById(BUTTON_ID)) return;

    const anchor = findPlayButtonContainer();
    if (!anchor || !anchor.parentNode) return; // Play button not ready; observer retries.

    const btn = buildButton();

    // Lay Play + globe side by side: wrap them in a flex row so Play flexes to
    // fill and the globe sits as a fixed square to its right.
    const row = document.createElement("div");
    row.className = "roservers-row-wrap";

    anchor.parentNode.insertBefore(row, anchor);
    row.appendChild(anchor);   // Play container, flexes to fill
    anchor.classList.add("roservers-play-flex");
    row.appendChild(btn);      // square globe button
  }

  // --- Popup: delegated to ui.js (the two-pane Choose Region experience) -----

  function onChooseServerClick() {
    const placeId = currentPlaceId();
    self.RoServersUI.open(placeId);
  }

  // --- Resilience: re-inject on DOM churn & navigation -----------------------

  // Roblox is a SPA: navigating between games swaps out the play button without
  // a full page reload, so a one-time injection isn't enough. We observe the
  // body and re-run injection (it's idempotent thanks to the guard above).
  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    // Coalesce bursts of mutations into a single injection attempt.
    requestAnimationFrame(() => {
      scheduled = false;
      injectButton();
    });
  }

  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.body, { childList: true, subtree: true });

  // Also catch SPA URL changes (history API) to drop a stale popup and re-check.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      const popup = document.getElementById(POPUP_ID);
      if (popup) popup.remove();
      scheduleInject();
    }
  }, 500);

  // First attempt on load.
  injectButton();
})();
