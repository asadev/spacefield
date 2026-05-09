"use client";

import { useEffect, useState } from "react";

/**
 * Client-side live preview of a brand config. Listens to form input
 * events on the parent <form> by the input names so the admin sees
 * changes immediately without a save round-trip.
 *
 * - "Hello world" card: primary_color background, accent_color button,
 *   font_family applied to the whole card.
 * - Email footer: sandboxed iframe with srcDoc containing the HTML
 *   wrapped in a minimal HTML shell.
 * - Custom CSS: sandboxed iframe with the CSS injected into a
 *   <style> tag; the body shows the same hello-world demo so the admin
 *   sees the CSS take effect.
 */
export default function LivePreview({
  initialPrimary,
  initialAccent,
  initialFont,
  initialBrandName,
  initialEmailFooter,
  initialCustomCss,
}: {
  initialPrimary: string | null;
  initialAccent: string | null;
  initialFont: string | null;
  initialBrandName: string | null;
  initialEmailFooter: string | null;
  initialCustomCss: string | null;
}) {
  const [primary, setPrimary] = useState(initialPrimary ?? "#0070f3");
  const [accent, setAccent] = useState(initialAccent ?? "#7928ca");
  const [font, setFont] = useState(initialFont ?? "Inter, system-ui, sans-serif");
  const [brandName, setBrandName] = useState(initialBrandName ?? "Brand");
  const [emailFooter, setEmailFooter] = useState(initialEmailFooter ?? "");
  const [customCss, setCustomCss] = useState(initialCustomCss ?? "");

  useEffect(() => {
    const form = typeof document !== "undefined"
      ? document.getElementById("brand-config-form") as HTMLFormElement | null
      : null;
    if (!form) return;

    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!t || !t.name) return;
      const val = t.value;
      switch (t.name) {
        case "primary_color":
          setPrimary(val || "#0070f3");
          break;
        case "accent_color":
          setAccent(val || "#7928ca");
          break;
        case "font_family":
          setFont(val || "Inter, system-ui, sans-serif");
          break;
        case "brand_name":
          setBrandName(val || "Brand");
          break;
        case "email_footer_html":
          setEmailFooter(val);
          break;
        case "custom_css":
          setCustomCss(val);
          break;
      }
    };

    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, []);

  // Build the email footer iframe source. Sandboxed (empty sandbox =
  // most-restrictive: no scripts, no forms, no top navigation).
  const emailFooterSrc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:12px;font-family:${escapeAttr(
    font
  )};color:#222;background:#fff;font-size:13px;line-height:1.5}a{color:${escapeAttr(
    primary
  )}}</style></head><body>${emailFooter || "<em style='color:#999'>(empty footer)</em>"}</body></html>`;

  // Build the custom-CSS demo iframe. Sandboxed identically.
  const customCssSrc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:16px;font-family:${escapeAttr(
    font
  )};background:#fff;color:#222}h2{margin:0 0 8px 0;font-size:16px}.card{border-radius:8px;padding:14px;background:${escapeAttr(
    primary
  )};color:#fff}.btn{display:inline-block;background:${escapeAttr(
    accent
  )};color:#fff;border-radius:6px;padding:6px 12px;text-decoration:none;font-size:12px;margin-top:8px}${customCss}</style></head><body><div class="card"><h2>${escapeHtml(
    brandName
  )}</h2><p style="margin:0 0 4px 0;font-size:12px;opacity:0.85">Custom CSS preview</p><a class="btn" href="#">Action</a></div></body></html>`;

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted">
          Hello world card
        </div>
        <div
          className="rounded-xl p-5 text-white shadow-sm"
          style={{
            backgroundColor: primary,
            fontFamily: font,
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
            {brandName}
          </div>
          <h3 className="mt-1 text-lg font-semibold">Hello, world.</h3>
          <p className="mt-1 text-xs opacity-90">
            This is how branded content will render.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}
          >
            Primary action
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Email footer (sandboxed)
          </div>
          <span className="text-[10px] text-faint">srcDoc · sandbox=&quot;&quot;</span>
        </div>
        <iframe
          title="Email footer preview"
          sandbox=""
          srcDoc={emailFooterSrc}
          className="block h-[180px] w-full rounded-lg border border-app bg-white"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Custom CSS demo (sandboxed)
          </div>
          <span className="text-[10px] text-faint">srcDoc · sandbox=&quot;&quot;</span>
        </div>
        <iframe
          title="Custom CSS preview"
          sandbox=""
          srcDoc={customCssSrc}
          className="block h-[200px] w-full rounded-lg border border-app bg-white"
        />
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  // Slightly stricter — same as html plus quotes — for use inside style/attr.
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
