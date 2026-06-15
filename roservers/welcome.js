// RoServers — welcome.js
// First-run onboarding. Shows once (tracked in chrome.storage.local) the first
// time the user opens a Roblox page after installing. Explains what the
// extension does and asks them to agree before use.
//
// No permission prompt is built here: RoServers declares all its host
// permissions in the manifest, granted by Chrome at install time. There are no
// optional/runtime permissions to request, so there's nothing to prompt for.

(function () {
  "use strict";

  const SEEN_KEY = "ro_welcomed";
  const OVERLAY_ID = "roservers-welcome";

  const FEATURES = [
    {
      title: "Server Regions",
      body: "Browse servers grouped by region — US, EU, Asia, Brazil, Oceania, and more.",
    },
    {
      title: "Ping Estimates",
      body: "See the ping for every server before you join, color-coded best to worst.",
    },
    {
      title: "Direct Server Join",
      body: "Jump straight into a specific server, skipping the matchmaker entirely.",
    },
    {
      title: "Pinned Regions",
      body: "Star your favorite regions to keep them pinned at the top, every time.",
    },
  ];

  async function maybeShow() {
    try {
      const obj = await chrome.storage.local.get(SEEN_KEY);
      if (obj && obj[SEEN_KEY]) return; // already onboarded
    } catch (e) {
      // If storage is unavailable, fail open (don't block the extension).
      return;
    }
    render();
  }

  function dismiss() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    chrome.storage.local.set({ [SEEN_KEY]: true }).catch(() => {});
  }

  function render() {
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "ro-welcome-overlay";

    const card = document.createElement("div");
    card.className = "ro-welcome-card";

    const features = FEATURES.map(
      (f) => `
        <div class="ro-welcome-feature">
          <div class="ro-welcome-feature-title">${f.title}</div>
          <div class="ro-welcome-feature-body">${f.body}</div>
        </div>`
    ).join("");

    card.innerHTML = `
      <div class="ro-welcome-head">
        <div class="ro-welcome-kicker">
          <span class="ro-welcome-mark">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18"></path>
              <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"></path>
            </svg>
          </span>
          ROSERVERS
        </div>
        <div class="ro-welcome-title">Welcome to RoServers</div>
      </div>
      <div class="ro-welcome-body">
        <p class="ro-welcome-intro">
          RoServers gives you full control over which Roblox server you join —
          choose by region, see ping estimates, and find the best server for your
          connection. Here's what you can do:
        </p>
        <div class="ro-welcome-features">${features}</div>
      </div>
      <div class="ro-welcome-foot">
        <p class="ro-welcome-note">Everything runs on your device. RoServers is free — no accounts, no paywall.</p>
        <button class="ro-welcome-btn" id="ro-welcome-agree">Agree &amp; Continue</button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    card.querySelector("#ro-welcome-agree").addEventListener("click", dismiss);
  }

  self.RoServersWelcome = { maybeShow };
})();
