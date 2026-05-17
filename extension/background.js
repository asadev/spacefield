/* ─────────────────────────────────────────────────────────────────────────
 * Spacefield Capture — service worker (MV3).
 *
 * Responsibilities:
 *   - Register a "Save to Spacefield" context-menu item on selection.
 *   - Listen for `capture` messages from content.js / popup.js and POST
 *     to https://spacefield.co/api/leads/capture (endpoint TBD — wiring
 *     is a follow-up; for now we just stash to chrome.storage.local).
 *
 * The auth model is also TBD. The plan is:
 *   1. User clicks "Sign in" in the popup → opens spacefield.co/auth
 *   2. Spacefield drops a long-lived API token + workspace_id into
 *      chrome.storage.local via a postMessage handshake.
 *   3. We attach that token in the Authorization header.
 *
 * Until that lands, the extension just queues captures locally so we can
 * test the UX end-to-end without a backend.
 * ───────────────────────────────────────────────────────────────────── */

const ENDPOINT = "https://spacefield.co/api/leads/capture";
const STORAGE_KEY = "sf_pending_captures";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sf-capture",
    title: "Save to Spacefield",
    contexts: ["selection", "link", "page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "sf-capture" || !tab) return;
  const payload = {
    url: info.linkUrl || info.pageUrl || (tab && tab.url) || "",
    title: (tab && tab.title) || "",
    selection: info.selectionText || "",
    captured_at: new Date().toISOString(),
  };
  await sendCapture(payload);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "sf-capture") {
    sendCapture(msg.payload).then((r) => sendResponse(r));
    return true; // async response
  }
  if (msg && msg.type === "sf-list-pending") {
    chrome.storage.local.get([STORAGE_KEY]).then((s) => {
      sendResponse({ pending: s[STORAGE_KEY] || [] });
    });
    return true;
  }
});

async function sendCapture(payload) {
  // Try to POST. If it fails, queue locally and surface in the popup.
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
    });
    if (r.ok) return { ok: true };
    await queueLocally(payload);
    return { ok: false, queued: true, status: r.status };
  } catch (e) {
    await queueLocally(payload);
    return { ok: false, queued: true, error: String(e) };
  }
}

async function queueLocally(payload) {
  const s = await chrome.storage.local.get([STORAGE_KEY]);
  const list = s[STORAGE_KEY] || [];
  list.push(payload);
  await chrome.storage.local.set({ [STORAGE_KEY]: list.slice(-100) });
}
