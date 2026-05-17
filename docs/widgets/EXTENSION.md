# Browser Extension — Spacefield Capture

A skeleton MV3 browser extension that captures the current page URL,
title, and selected text and saves it to a Spacefield workspace as a
lead.

The code lives at the repo root in `extension/`.

## Status

**Skeleton.** The capture endpoint (`/api/leads/capture`) isn't wired
yet — see the Roadmap section in `extension/README.md`. Until the
backend lands the extension queues captures in `chrome.storage.local`.

## Files

| File             | Role                                                           |
| ---------------- | -------------------------------------------------------------- |
| `manifest.json`  | MV3 manifest. Action + service worker + content script.        |
| `background.js`  | Service worker. Context menu, POST, local queue.               |
| `content.js`    | Passive content script. Reads selection + page meta on demand. |
| `popup.html`     | Toolbar popup markup.                                          |
| `popup.js`       | Popup controller — pre-fills from active tab, posts on click.  |
| `README.md`      | Dev install steps + roadmap.                                   |

## Local development

1. Open `chrome://extensions`, toggle "Developer mode".
2. Click "Load unpacked", point at `extension/`.
3. Visit any HTTPS site, click the toolbar icon, hit "Save to Spacefield".

## Permissions requested

- `activeTab` — read URL/title of the user's current tab on popup open.
- `storage` — local queue.
- `contextMenus` — "Save to Spacefield" right-click entry.
- `scripting` — reserved for future programmatic injection.
- Host: `https://spacefield.co/*` — POST target.

## Privacy stance

- The content script is `run_at: document_idle` and **passive** — it
  only responds to messages from our own popup/background. It never
  sends anything proactively.
- Captures are user-initiated only (popup button or context menu).
- No telemetry, no third-party scripts, no analytics.
