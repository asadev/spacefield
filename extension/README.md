# Spacefield Capture — Browser Extension

A skeleton MV3 extension that captures the current page URL, title, and any
selected text and sends it to a Spacefield workspace as a lead.

## Status

**Scaffold only.** The capture POST endpoint
(`https://spacefield.co/api/leads/capture`) is not yet implemented on the
server. Until it lands, captures are queued locally in
`chrome.storage.local` under `sf_pending_captures` (max 100 entries, ring
buffer).

## Files

- `manifest.json` — MV3 manifest, `<all_urls>` content script + popup
- `background.js` — service worker, context-menu + POST + local queue
- `content.js` — passive content script, exposes selection + page meta
- `popup.html` / `popup.js` — toolbar popup UI

## Permissions requested

- `activeTab` — read the URL/title of the tab the user is on when the
  popup opens. We do NOT request broad-host read access — `<all_urls>` in
  `content_scripts.matches` is for injection, not for cross-origin reads.
- `storage` — local queue for offline / pre-auth captures.
- `contextMenus` — register "Save to Spacefield" on selection/page/link.
- `scripting` — optional, kept for future programmatic injection if we
  decide to drop the static `content_scripts` entry.

Host permission: `https://spacefield.co/*` so we can `fetch()` the
capture endpoint without CORS surprises.

## Local development

1. `chrome://extensions` → enable Developer mode.
2. "Load unpacked" → select `extension/`.
3. The toolbar should show the Spacefield Capture icon. (Icons aren't
   shipped yet — Chrome will fall back to the puzzle piece.)
4. Visit any HTTPS site, click the icon, hit "Save to Spacefield". The
   request will fail (no endpoint), and you'll see "Offline — queued".
5. Check `chrome.storage.local` via DevTools to verify the queue.

## Roadmap

- [ ] Build the `/api/leads/capture` server endpoint (idempotency-key
      header, workspace-scoped, token-auth).
- [ ] Add the auth handshake in popup.js (open `spacefield.co/auth`,
      receive token via `chrome.runtime.onMessageExternal`, persist in
      `chrome.storage.local`).
- [ ] Ship icons (`icon-16/48/128.png`) — currently referenced in the
      manifest but not present.
- [ ] Background retry: when network comes back, drain the local queue.

## Why MV3

Chrome killed MV2 in mid-2024; Edge followed; Firefox supports MV3 with
some quirks (service workers are emulated as event pages). Going straight
to MV3 avoids a future migration.
