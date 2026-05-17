/* ─────────────────────────────────────────────────────────────────────────
 * Spacefield Capture — content script.
 *
 * Runs on every page (matches: <all_urls>, run_at: document_idle).
 * Responsibility: respond to popup.js requests for the current selection
 * + page metadata. We don't auto-send anything from here — capture is
 * always initiated by the user (popup click or context menu) so this
 * stays passive and respects user privacy.
 * ───────────────────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "sf-get-page") {
    const selection = window.getSelection ? String(window.getSelection() || "") : "";
    const meta = readMeta();
    sendResponse({
      url: location.href,
      title: document.title || "",
      selection: selection.trim(),
      description: meta.description,
      og_image: meta.og_image,
    });
    return; // sync
  }
});

function readMeta() {
  let description = "";
  let og_image = "";
  const metas = document.querySelectorAll("meta");
  metas.forEach((m) => {
    const name = (m.getAttribute("name") || m.getAttribute("property") || "").toLowerCase();
    const content = m.getAttribute("content") || "";
    if (!content) return;
    if (name === "description" || name === "og:description") {
      if (!description) description = content;
    }
    if (name === "og:image" || name === "twitter:image") {
      if (!og_image) og_image = content;
    }
  });
  return { description, og_image };
}
