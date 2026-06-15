// RoServers — ui.js (M5)
// Owns the entire "Choose Region" popup: a two-pane layout modeled on the
// reference design. Left rail = continents -> cities with server counts + play.
// Right pane = a decorative spinnable globe until a city is chosen, then the
// joinable server cards for that city.
//
// Data flow:
//   1. Open -> fetch server list (background) -> batch-resolve regions (background,
//      streamed progress) -> bucket servers by region.
//   2. Only the known regions in regions.js are shown; unmapped servers are
//      dropped. Cities with 0 servers render greyed out.
//   3. Ping per card: server's reported avg ping, else an estimate from the
//      user's location to that datacenter.

(function () {
  "use strict";

  const POPUP_ID = "roservers-popup";

  const Regions = self.RoServersRegions;
  const Geo = self.RoServersGeo;

  // State for the currently open popup.
  let state = null;

  function isOpen() {
    return !!document.getElementById(POPUP_ID);
  }

  function close() {
    const el = document.getElementById(POPUP_ID);
    if (el) el.remove();
    if (state && state.progressHandler) {
      chrome.runtime.onMessage.removeListener(state.progressHandler);
    }
    state = null;
  }

  function open(placeId) {
    if (isOpen()) {
      close();
      return;
    }

    state = {
      placeId,
      servers: [],          // raw joinable servers
      byRegion: new Map(),  // regionId -> [server,...]
      pendingResolves: 0,
      userCoords: null,
      selectedRegionId: null,
      progressHandler: null,
      countEls: new Map(),  // regionId -> count badge element (live update)
      pinEls: new Map(),    // regionId -> map pin <g> element (live update)
      pinned: new Set(),    // regionIds the user has pinned (persisted)
    };

    // Load pinned regions (fire-and-forget; rail re-renders when it arrives).
    chrome.storage.local.get("ro_pinned").then((obj) => {
      const arr = Array.isArray(obj.ro_pinned) ? obj.ro_pinned : [];
      state.pinned = new Set(arr);
      if (state.rail && state.servers.length) renderRail();
    }).catch(() => {});

    const overlay = document.createElement("div");
    overlay.id = POPUP_ID;
    overlay.className = "ro-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const panel = document.createElement("div");
    panel.className = "ro-panel";
    overlay.appendChild(panel);

    // Left rail.
    const rail = document.createElement("div");
    rail.className = "ro-rail";
    rail.innerHTML = `
      <div class="ro-rail-head">Server Locations</div>
      <div class="ro-rail-body"><div class="ro-rail-loading">Finding servers…</div></div>
    `;
    panel.appendChild(rail);

    // Right pane.
    const pane = document.createElement("div");
    pane.className = "ro-pane";
    panel.appendChild(pane);

    document.body.appendChild(overlay);

    state.rail = rail.querySelector(".ro-rail-body");
    state.pane = pane;

    renderGlobePane(); // decorative default
    if (!placeId) {
      state.rail.innerHTML = `<div class="ro-rail-loading">Open a game page to see servers.</div>`;
      return;
    }

    loadServers();
  }

  // --- Data loading ----------------------------------------------------------

  async function loadServers() {
    try {
      const servers = await sendBG({ type: "ROSERVERS_FETCH_SERVERS", placeId: state.placeId });
      // Joinable only.
      state.servers = (servers || []).filter((s) => !s.maxPlayers || s.playing < s.maxPlayers);

      // Build empty buckets for every known region so 0-count cities still show.
      for (const r of Regions.REGIONS) state.byRegion.set(r.id, []);

      // Render the rail now (all 0 counts), then resolve to fill counts in.
      renderRail();

      // Get user location for ping estimates (non-blocking; cards still work).
      sendBG({ type: "ROSERVERS_GET_USER_LOCATION" })
        .then((loc) => { if (loc && loc.coords) state.userCoords = loc.coords; })
        .catch(() => {});

      // Stream region resolution.
      startResolution();
    } catch (err) {
      state.rail.innerHTML = `<div class="ro-rail-loading">Couldn't load servers. ${escapeHtml(
        (err && err.message) || String(err)
      )}</div>`;
    }
  }

  function startResolution() {
    const toResolve = state.servers.slice(0, 60);
    state.pendingResolves = toResolve.length;
    updateFooter();

    state.progressHandler = (msg) => {
      if (!msg || msg.type !== "ROSERVERS_BATCH_PROGRESS") return;
      const server = state.servers.find((s) => s.id === msg.serverId);
      if (server && msg.regionId && state.byRegion.has(msg.regionId)) {
        state.byRegion.get(msg.regionId).push(server);
        updateCount(msg.regionId);
        updatePin(msg.regionId);
        // If the user is currently viewing this region, refresh its cards.
        if (state.selectedRegionId === msg.regionId) renderServerCards(msg.regionId);
      }
      state.pendingResolves--;
      updateFooter();
    };
    chrome.runtime.onMessage.addListener(state.progressHandler);

    chrome.runtime.sendMessage(
      { type: "ROSERVERS_RESOLVE_BATCH", placeId: state.placeId, servers: toResolve },
      () => void chrome.runtime.lastError
    );
  }

  // --- Left rail rendering ---------------------------------------------------

  function buildCityRow(r) {
    const count = state.byRegion.get(r.id)?.length || 0;
    const row = document.createElement("div");
    row.className = "ro-city" + (count === 0 ? " ro-city-empty" : "");

    const flag = document.createElement("span");
    flag.className = "ro-flag";
    flag.textContent = r.flag;

    const name = document.createElement("span");
    name.className = "ro-city-name";
    name.textContent = r.label;

    // Pin toggle (M7): pinned cities float into the PINNED group on top and
    // persist across sessions.
    const pin = document.createElement("button");
    const isPinned = state.pinned.has(r.id);
    pin.className = "ro-city-pin" + (isPinned ? " ro-city-pin-on" : "");
    pin.innerHTML = isPinned ? "&#9733;" : "&#9734;"; // ★ / ☆
    pin.title = isPinned ? "Unpin region" : "Pin region to top";
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePin(r.id);
    });

    const badge = document.createElement("span");
    badge.className = "ro-count";
    badge.textContent = countLabel(count);
    state.countEls.set(r.id, badge);

    const play = document.createElement("button");
    play.className = "ro-city-play";
    play.innerHTML = "&#9654;"; // ▶
    play.disabled = count === 0;
    play.addEventListener("click", (e) => {
      e.stopPropagation();
      selectRegion(r.id);
    });

    row.appendChild(flag);
    row.appendChild(name);
    row.appendChild(pin);
    row.appendChild(badge);
    if (count > 0) row.appendChild(play);
    row.addEventListener("click", () => {
      if ((state.byRegion.get(r.id)?.length || 0) > 0) selectRegion(r.id);
    });
    return row;
  }

  function renderRail() {
    const frag = document.createDocumentFragment();
    state.countEls = new Map();

    // PINNED group first, if any.
    const pinnedRegions = Regions.REGIONS.filter((r) => state.pinned.has(r.id));
    if (pinnedRegions.length) {
      const group = document.createElement("div");
      group.className = "ro-group";
      const head = document.createElement("div");
      head.className = "ro-group-head ro-group-head-pinned";
      head.textContent = "★ PINNED";
      group.appendChild(head);
      for (const r of pinnedRegions) group.appendChild(buildCityRow(r));
      frag.appendChild(group);
    }

    // Continent groups (pinned cities are moved up, not duplicated).
    for (const continent of Regions.CONTINENT_ORDER) {
      const cities = Regions.REGIONS.filter(
        (r) => r.continent === continent && !state.pinned.has(r.id)
      );
      if (!cities.length) continue;

      const group = document.createElement("div");
      group.className = "ro-group";

      const head = document.createElement("div");
      head.className = "ro-group-head";
      head.textContent = continent.toUpperCase();
      group.appendChild(head);

      for (const r of cities) group.appendChild(buildCityRow(r));
      frag.appendChild(group);
    }

    state.rail.innerHTML = "";
    state.rail.appendChild(frag);

    // Status footer: live resolution progress (M7 polish).
    const footer = document.createElement("div");
    footer.className = "ro-rail-footer";
    footer.id = "ro-rail-footer";
    state.rail.appendChild(footer);
    updateFooter();
  }

  function togglePin(regionId) {
    if (state.pinned.has(regionId)) state.pinned.delete(regionId);
    else state.pinned.add(regionId);
    chrome.storage.local.set({ ro_pinned: [...state.pinned] }).catch(() => {});
    renderRail();
  }

  function updateFooter() {
    const footer = document.getElementById("ro-rail-footer");
    if (!footer) return;
    if (state.pendingResolves > 0) {
      footer.innerHTML = `<span class="ro-spinner"></span> Locating servers… ${state.pendingResolves} left`;
    } else {
      const total = [...state.byRegion.values()].reduce((n, a) => n + a.length, 0);
      footer.textContent = total
        ? `${total} server${total === 1 ? "" : "s"} located`
        : "";
    }
  }

  function updateCount(regionId) {
    const badge = state.countEls.get(regionId);
    const count = state.byRegion.get(regionId)?.length || 0;
    if (badge) {
      badge.textContent = countLabel(count);
      const row = badge.closest(".ro-city");
      if (row && count > 0) {
        row.classList.remove("ro-city-empty");
        // Add a play button if it wasn't there.
        if (!row.querySelector(".ro-city-play")) {
          const play = document.createElement("button");
          play.className = "ro-city-play";
          play.innerHTML = "&#9654;";
          play.addEventListener("click", (e) => {
            e.stopPropagation();
            selectRegion(regionId);
          });
          row.appendChild(play);
          row.addEventListener("click", () => selectRegion(regionId));
        }
      }
    }
  }

  // Light up a map pin in place when its region first gets a server (only
  // matters while the map empty-state is showing).
  function updatePin(regionId) {
    const g = state.pinEls.get(regionId);
    if (!g || g.classList.contains("ro-pin-active")) return;
    const count = state.byRegion.get(regionId)?.length || 0;
    if (count <= 0) return;

    const svgNS = "http://www.w3.org/2000/svg";
    g.classList.add("ro-pin-active");
    g.style.cursor = "pointer";

    // Add a pulsing halo behind the dot.
    const halo = document.createElementNS(svgNS, "circle");
    halo.setAttribute("r", 4);
    halo.setAttribute("class", "ro-pin-halo");
    g.insertBefore(halo, g.firstChild);

    const dot = g.querySelector(".ro-pin-dot");
    if (dot) dot.setAttribute("r", 3.2);

    const region = Geo.regionById(regionId);
    const titleEl = g.querySelector("title");
    if (titleEl && region) titleEl.textContent = `${region.label} — ${countLabel(count)}`;

    g.addEventListener("click", () => selectRegion(regionId));
  }

  // --- Right pane: globe + server cards --------------------------------------

  function renderGlobePane() {
    state.selectedRegionId = null;
    state.pane.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "ro-map-wrap";

    const title = document.createElement("div");
    title.className = "ro-map-title";
    title.textContent = "Pick a location";

    const sub = document.createElement("div");
    sub.className = "ro-map-sub";
    sub.textContent = "Choose a region on the left to see its servers.";

    // World map with a glowing pin at each datacenter we know about.
    const map = buildWorldMap();

    wrap.appendChild(title);
    wrap.appendChild(map);
    wrap.appendChild(sub);
    state.pane.appendChild(wrap);
  }

  // Equirectangular projection: lon [-180,180] -> x [0,W], lat [90,-90] -> y [0,H].
  function project(lat, lon, W, H) {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  }

  function buildWorldMap() {
    const W = 720, H = 360;
    const svgNS = "http://www.w3.org/2000/svg";
    state.pinEls = new Map();
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "ro-map-svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Subtle dotted-grid landmass silhouette via a background rect + graticule.
    const ocean = document.createElementNS(svgNS, "rect");
    ocean.setAttribute("x", 0); ocean.setAttribute("y", 0);
    ocean.setAttribute("width", W); ocean.setAttribute("height", H);
    ocean.setAttribute("class", "ro-map-ocean");
    ocean.setAttribute("rx", 14);
    svg.appendChild(ocean);

    // Graticule lines for a "globe-grid" feel without faking 3D.
    for (let lon = -150; lon <= 150; lon += 30) {
      const [x] = project(0, lon, W, H);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", x); line.setAttribute("y1", 0);
      line.setAttribute("x2", x); line.setAttribute("y2", H);
      line.setAttribute("class", "ro-map-grid");
      svg.appendChild(line);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y] = project(lat, 0, W, H);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", 0); line.setAttribute("y1", y);
      line.setAttribute("x2", W); line.setAttribute("y2", y);
      line.setAttribute("class", "ro-map-grid");
      svg.appendChild(line);
    }

    // A pin per known region. Pins with servers in the current game glow
    // brighter; empty ones are dim. Hover shows the city; click selects it.
    for (const r of Regions.REGIONS) {
      const count = state.byRegion.get(r.id)?.length || 0;
      const [x, y] = project(r.coords[0], r.coords[1], W, H);

      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("class", "ro-pin" + (count > 0 ? " ro-pin-active" : ""));
      g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

      // Pulsing halo (only for active regions).
      if (count > 0) {
        const halo = document.createElementNS(svgNS, "circle");
        halo.setAttribute("r", 4);
        halo.setAttribute("class", "ro-pin-halo");
        g.appendChild(halo);
      }
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("r", count > 0 ? 3.2 : 2);
      dot.setAttribute("class", "ro-pin-dot");
      g.appendChild(dot);

      const title = document.createElementNS(svgNS, "title");
      title.textContent = count > 0 ? `${r.label} — ${countLabel(count)}` : `${r.label} — 0 servers`;
      g.appendChild(title);

      if (count > 0) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => selectRegion(r.id));
      }
      g._roCoords = [x, y]; // remember for in-place upgrade
      state.pinEls.set(r.id, g);
      svg.appendChild(g);
    }

    return svg;
  }

  function selectRegion(regionId) {
    state.selectedRegionId = regionId;
    renderServerCards(regionId);
  }

  function renderServerCards(regionId) {
    const region = Geo.regionById(regionId);
    const servers = (state.byRegion.get(regionId) || []).slice().sort((a, b) => {
      // Best (lowest ping) first.
      return pingFor(a, region) - pingFor(b, region);
    });

    const head = document.createElement("div");
    head.className = "ro-pane-head";
    head.innerHTML = `
      <span class="ro-pane-title">${region.flag} Servers in ${escapeHtml(region.label)}</span>
      <button class="ro-pane-close">Close</button>
    `;
    head.querySelector(".ro-pane-close").addEventListener("click", renderGlobePane);

    const grid = document.createElement("div");
    grid.className = "ro-card-grid";

    if (!servers.length) {
      grid.innerHTML = `<div class="ro-rail-loading">No servers here yet.</div>`;
    }

    for (const s of servers) {
      grid.appendChild(buildServerCard(s, region));
    }

    state.pane.innerHTML = "";
    state.pane.appendChild(head);
    state.pane.appendChild(grid);

    // One batched thumbnail request for all avatars now visible.
    loadAvatarsFor(grid, servers);
  }

  const AVATARS_PER_CARD = 5;

  // Fetch headshot URLs for every placeholder avatar in this grid and fill
  // them in. Placeholders carry data-token; tokens map 1:1 to image URLs.
  async function loadAvatarsFor(grid, servers) {
    const tokens = [];
    for (const s of servers) {
      for (const t of (s.playerTokens || []).slice(0, AVATARS_PER_CARD)) {
        tokens.push(t);
      }
    }
    if (!tokens.length) return;

    try {
      const res = await sendBG({ type: "ROSERVERS_FETCH_THUMBS", tokens });
      const urls = res.urls || res; // sendBG unwraps known keys; be lenient
      grid.querySelectorAll(".ro-avatar[data-token]").forEach((img) => {
        const url = urls[img.dataset.token];
        if (url) {
          img.src = url;
          img.classList.add("ro-avatar-loaded");
        }
      });
    } catch (e) {
      // Avatars are decoration; fail silently and keep the placeholders.
    }
  }

  function buildServerCard(server, region) {
    const card = document.createElement("div");
    card.className = "ro-card";

    const ping = pingFor(server, region);
    const estimated = server.avgPing == null;

    const players = document.createElement("div");
    players.className = "ro-card-players";
    players.innerHTML = `<span class="ro-dot"></span> ${server.playing} / ${server.maxPlayers} players`;

    // Avatar headshots of players currently in this server (filled in by
    // loadAvatarsFor once the batched thumbnail request returns).
    const avatars = document.createElement("div");
    avatars.className = "ro-avatars";
    for (const token of (server.playerTokens || []).slice(0, AVATARS_PER_CARD)) {
      const img = document.createElement("img");
      img.className = "ro-avatar";
      img.dataset.token = token;
      img.alt = "";
      img.loading = "lazy";
      avatars.appendChild(img);
    }
    const extra = server.playing - Math.min(server.playerTokens?.length || 0, AVATARS_PER_CARD);
    if (extra > 0 && avatars.children.length) {
      const more = document.createElement("span");
      more.className = "ro-avatar-more";
      more.textContent = `+${extra}`;
      avatars.appendChild(more);
    }

    const pingEl = document.createElement("div");
    pingEl.className = "ro-card-ping " + pingTierClass(ping);
    pingEl.textContent = `Ping: ${ping}ms${estimated ? " (est.)" : ""}`;

    const join = document.createElement("button");
    join.className = "ro-card-join";
    join.textContent = "Join";
    join.title = "Join this server";
    join.addEventListener("click", async () => {
      if (join.disabled) return;
      join.disabled = true;
      join.classList.add("ro-card-join-pending");
      join.innerHTML = "Launching…";
      try {
        await self.RoServersJoin.joinServer(Number(state.placeId), server.id);
        join.innerHTML = "Launched ✓";
        // Roblox hands off to the desktop client; close the popup shortly after.
        setTimeout(close, 1200);
      } catch (err) {
        join.classList.remove("ro-card-join-pending");
        join.disabled = false;
        join.innerHTML = "Try again";
        join.title = (err && err.message) || "Join failed";
        console.warn("[RoServers] join failed:", err);
      }
    });

    card.appendChild(players);
    if (avatars.children.length) card.appendChild(avatars);

    // Boarding-pass stub: perforated divider, ping chip + join action.
    const stub = document.createElement("div");
    stub.className = "ro-card-stub";
    stub.appendChild(pingEl);
    stub.appendChild(join);
    card.appendChild(stub);
    return card;
  }

  // Ping for a server: prefer reported avg, fall back to distance estimate.
  function pingFor(server, region) {
    if (server.avgPing != null) return Math.round(server.avgPing);
    const est = Geo.estimatePingMs(state.userCoords, region.coords);
    return est == null ? 999 : est;
  }

  // Color tier: <70 green, 70–100 yellow, >100 red.
  function pingTierClass(ping) {
    if (ping < 70) return "ro-ping-good";
    if (ping <= 100) return "ro-ping-mid";
    return "ro-ping-bad";
  }

  // --- Helpers ---------------------------------------------------------------

  function countLabel(n) {
    return n === 1 ? "1 server" : `${n} servers`;
  }

  function sendBG(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || !response.ok) return reject(new Error(response?.error || "Background error"));
        resolve(response.servers ?? response.result ?? response.location ?? response);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Expose to content.js.
  self.RoServersUI = { open, close, isOpen };
})();
