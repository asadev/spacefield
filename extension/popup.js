/* ─────────────────────────────────────────────────────────────────────────
 * Spacefield Capture — popup UI controller.
 *
 * On open: ask the active tab's content script for its URL + title +
 * any current selection. On Save: send the payload to background.js
 * which handles the actual POST (and queueing on failure).
 * ───────────────────────────────────────────────────────────────────── */

(async function init() {
  const titleEl = document.getElementById("sf-title");
  const urlEl = document.getElementById("sf-url");
  const selEl = document.getElementById("sf-selection");
  const btn = document.getElementById("sf-save");
  const status = document.getElementById("sf-status");

  function setStatus(msg, klass) {
    status.textContent = msg;
    status.className = "status" + (klass ? " " + klass : "");
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus("No active tab.", "err");
    return;
  }

  // Pre-fill from tab metadata; ask the content script for the live selection.
  titleEl.value = tab.title || "";
  urlEl.value = tab.url || "";
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "sf-get-page" });
    if (r && r.selection) selEl.value = r.selection;
    if (r && r.title && !titleEl.value) titleEl.value = r.title;
    if (r && r.url && !urlEl.value) urlEl.value = r.url;
  } catch (_e) {
    // Content script may not be injected on chrome:// pages etc — fine.
  }

  btn.addEventListener("click", async () => {
    setStatus("Saving…");
    btn.disabled = true;
    const payload = {
      title: titleEl.value,
      url: urlEl.value,
      selection: selEl.value,
      captured_at: new Date().toISOString(),
    };
    try {
      const r = await chrome.runtime.sendMessage({ type: "sf-capture", payload });
      if (r && r.ok) {
        setStatus("Saved to Spacefield.", "ok");
      } else if (r && r.queued) {
        setStatus("Offline — queued for retry.", "err");
      } else {
        setStatus("Failed to save.", "err");
      }
    } catch (e) {
      setStatus("Error: " + String(e), "err");
    } finally {
      btn.disabled = false;
    }
  });
})();
