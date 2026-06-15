// RoServers — popup.js (M7)
// Toolbar popup: clear the cached server->region results. Useful if Roblox
// shifts IP ranges or a region looks wrong.

document.getElementById("clear").addEventListener("click", () => {
  const status = document.getElementById("status");
  status.textContent = "Clearing…";
  chrome.runtime.sendMessage({ type: "ROSERVERS_CLEAR_CACHE" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      status.textContent = "Couldn't clear cache.";
      return;
    }
    status.textContent = res.cleared
      ? `Cleared ${res.cleared} cached entr${res.cleared === 1 ? "y" : "ies"}.`
      : "Cache was already empty.";
  });
});
