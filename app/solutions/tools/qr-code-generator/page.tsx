"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, inputCls } from "../../_components/ToolCard";

type Mode = "url" | "text" | "vcard" | "wifi" | "sms" | "geo" | "email";

function escapeMecard(v: string) {
  return v.replace(/([\\;,:])/g, "\\$1");
}

function escapeWifi(v: string) {
  return v.replace(/([\\;,":])/g, "\\$1");
}

export default function QrCodeGeneratorPage() {
  const [mode, setMode] = useState<Mode>("url");
  const [text, setText] = useState("https://example.com");
  const [size, setSize] = useState("320");
  const [margin, setMargin] = useState("2");
  const [ecl, setEcl] = useState<"L" | "M" | "Q" | "H">("M");
  const [dark, setDark] = useState("#0a0a0a");
  const [light, setLight] = useState("#ffffff");
  const [svg, setSvg] = useState("");
  const [dataUrl, setDataUrl] = useState("");

  // vCard fields
  const [vName, setVName] = useState("Alex Thompson");
  const [vOrg, setVOrg] = useState("Acme Inc");
  const [vTitle, setVTitle] = useState("Head of Growth");
  const [vPhone, setVPhone] = useState("+1 555 123 4567");
  const [vEmail, setVEmail] = useState("alex@acme.com");
  const [vUrl, setVUrl] = useState("https://acme.com");

  // Wi-Fi fields
  const [wifiSsid, setWifiSsid] = useState("My Network");
  const [wifiPw, setWifiPw] = useState("correct-horse");
  const [wifiEnc, setWifiEnc] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);

  // SMS fields
  const [smsNum, setSmsNum] = useState("+15551234567");
  const [smsBody, setSmsBody] = useState("Hello from a QR code");

  // Geo fields
  const [geoLat, setGeoLat] = useState("24.4539");
  const [geoLng, setGeoLng] = useState("54.3773");

  // Email fields
  const [emailAddr, setEmailAddr] = useState("hello@example.com");
  const [emailSub, setEmailSub] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Logo overlay
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(20); // % of QR

  const payload = useMemo(() => {
    switch (mode) {
      case "url":
      case "text":
        return text;
      case "vcard": {
        // MECARD format (compact, works well on phones)
        const parts = [
          `N:${escapeMecard(vName)}`,
          vOrg ? `ORG:${escapeMecard(vOrg)}` : "",
          vTitle ? `TITLE:${escapeMecard(vTitle)}` : "",
          vPhone ? `TEL:${escapeMecard(vPhone)}` : "",
          vEmail ? `EMAIL:${escapeMecard(vEmail)}` : "",
          vUrl ? `URL:${escapeMecard(vUrl)}` : "",
        ].filter(Boolean);
        return `MECARD:${parts.join(";")};;`;
      }
      case "wifi": {
        const parts = [
          `T:${wifiEnc}`,
          `S:${escapeWifi(wifiSsid)}`,
          wifiEnc !== "nopass" ? `P:${escapeWifi(wifiPw)}` : "",
          wifiHidden ? "H:true" : "",
        ].filter(Boolean);
        return `WIFI:${parts.join(";")};;`;
      }
      case "sms":
        return `SMSTO:${smsNum}:${smsBody}`;
      case "geo":
        return `geo:${geoLat},${geoLng}`;
      case "email": {
        const qs: string[] = [];
        if (emailSub) qs.push(`subject=${encodeURIComponent(emailSub)}`);
        if (emailBody) qs.push(`body=${encodeURIComponent(emailBody)}`);
        return `mailto:${emailAddr}${qs.length ? "?" + qs.join("&") : ""}`;
      }
    }
  }, [
    mode, text,
    vName, vOrg, vTitle, vPhone, vEmail, vUrl,
    wifiSsid, wifiPw, wifiEnc, wifiHidden,
    smsNum, smsBody, geoLat, geoLng,
    emailAddr, emailSub, emailBody,
  ]);

  useEffect(() => {
    let cancelled = false;
    const input = payload.trim() || " ";
    const stringOpts = {
      errorCorrectionLevel: ecl,
      margin: parseInt(margin) || 0,
      width: parseInt(size) || 320,
      color: { dark, light },
      type: "svg" as const,
    };
    const dataUrlOpts = {
      errorCorrectionLevel: ecl,
      margin: parseInt(margin) || 0,
      width: parseInt(size) || 320,
      color: { dark, light },
    };

    const run = async () => {
      try {
        const [s, baseDataUrl] = await Promise.all([
          QRCode.toString(input, stringOpts),
          QRCode.toDataURL(input, dataUrlOpts),
        ]);
        if (cancelled) return;
        setSvg(s);
        if (!logoSrc) {
          setDataUrl(baseDataUrl);
          return;
        }
        // Composite logo onto center (requires H-level ECC for reliability)
        const img = new Image();
        img.src = baseDataUrl;
        await new Promise((r) => { img.onload = r; });
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.src = logoSrc;
        await new Promise((r) => { logo.onload = r; logo.onerror = r; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const pct = Math.max(10, Math.min(30, logoSize)) / 100;
        const lw = img.width * pct;
        const lh = img.height * pct;
        const lx = (img.width - lw) / 2;
        const ly = (img.height - lh) / 2;
        // White pad behind logo for contrast
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(lx - 4, ly - 4, lw + 8, lh + 8);
        try {
          ctx.drawImage(logo, lx, ly, lw, lh);
        } catch {
          // if logo is CORS-tainted we can still output the base QR
        }
        if (!cancelled) setDataUrl(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) {
          setSvg("");
          setDataUrl("");
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [payload, size, margin, ecl, dark, light, logoSrc, logoSize]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr.png";
    a.click();
  };

  const onLogo = (file: File | null) => {
    if (!file) { setLogoSrc(null); return; }
    const r = new FileReader();
    r.onload = () => { if (typeof r.result === "string") setLogoSrc(r.result); };
    r.readAsDataURL(file);
  };

  const modes: { k: Mode; label: string }[] = [
    { k: "url", label: "URL" },
    { k: "text", label: "Text" },
    { k: "vcard", label: "vCard" },
    { k: "wifi", label: "Wi-Fi" },
    { k: "sms", label: "SMS" },
    { k: "email", label: "Email" },
    { k: "geo", label: "Geo" },
  ];

  const eclLevels: { k: "L" | "M" | "Q" | "H"; label: string; pct: string }[] = [
    { k: "L", label: "L", pct: "7%" },
    { k: "M", label: "M", pct: "15%" },
    { k: "Q", label: "Q", pct: "25%" },
    { k: "H", label: "H", pct: "30%" },
  ];

  const presetSwatches = [
    { fg: "#0a0a0a", bg: "#ffffff", label: "classic" },
    { fg: "#ffffff", bg: "#0a0a0a", label: "inverse" },
    { fg: "#1d4ed8", bg: "#ffffff", label: "blue" },
    { fg: "#0f766e", bg: "#ffffff", label: "teal" },
    { fg: "#7c3aed", bg: "#ffffff", label: "violet" },
    { fg: "#be123c", bg: "#ffffff", label: "rose" },
  ];

  return (
    <div data-tool-theme="design" data-tool="qr-code-generator">
      <ToolShell
        category="Data & Developer"
        title="QR Code Generator"
        description="Generate QR codes for URLs, text, vCards, Wi-Fi logins, SMS, email, and geo coordinates. Optional logo overlay. Runs entirely in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {mode}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              ecc:{ecl}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              qr.encode
              <span className="text-faint">/</span>
              <span className="text-secondary">{payload.length} chars</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {dataUrl ? "◉ ready" : "…"}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Live preview · client-only
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {size}px
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    margin {margin}
                  </span>
                  {logoSrc && (
                    <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-tool-accent">
                      logo {logoSize}%
                    </span>
                  )}
                </div>

                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {mode === "url" || mode === "text" ? "Encode anything scannable" :
                   mode === "vcard" ? "Share contact card" :
                   mode === "wifi" ? "Share Wi-Fi login" :
                   mode === "sms" ? "Pre-filled SMS" :
                   mode === "email" ? "Pre-filled email" :
                   "Open in Maps"}
                </h1>
              </div>
            </div>
          </div>

          {/* mode segmented row */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
              {modes.map((m) => (
                <button
                  key={m.k}
                  onClick={() => setMode(m.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === m.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={downloadPng}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Download PNG
              </button>
              <button
                onClick={downloadSvg}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Download SVG
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* QR preview hero */}
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ preview · {mode}
                </div>
                <div className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                  ECC {ecl}
                </div>
              </div>

              <div className="p-5">
                <div
                  className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center rounded-xl border border-app p-6"
                  style={{ backgroundColor: light }}
                >
                  {dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dataUrl} alt="QR code" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sm text-muted">No content yet</span>
                  )}
                </div>
              </div>
            </div>

            <ToolCard title="Encoded payload" subtitle="Raw string written to the code">
              <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-[0.7rem] text-app">
                {payload}
              </pre>
            </ToolCard>
          </div>

          {/* Options panel */}
          <ToolCard title="Options" subtitle={mode.toUpperCase()}>
            <div className="space-y-5">
              {/* Content fields */}
              <div className="space-y-4 rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Content
                </div>
                {(mode === "url" || mode === "text") && (
                  <Field label={mode === "url" ? "URL" : "Text"}>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} className={inputCls("min-h-[110px] font-mono text-xs")} />
                  </Field>
                )}

                {mode === "vcard" && (
                  <>
                    <Field label="Name"><input value={vName} onChange={(e) => setVName(e.target.value)} className={inputCls()} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Organization"><input value={vOrg} onChange={(e) => setVOrg(e.target.value)} className={inputCls()} /></Field>
                      <Field label="Title"><input value={vTitle} onChange={(e) => setVTitle(e.target.value)} className={inputCls()} /></Field>
                    </div>
                    <Field label="Phone"><input value={vPhone} onChange={(e) => setVPhone(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    <Field label="Email"><input value={vEmail} onChange={(e) => setVEmail(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    <Field label="URL"><input value={vUrl} onChange={(e) => setVUrl(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    <p className="text-[0.65rem] text-muted">MECARD format — widely supported on iOS/Android camera apps.</p>
                  </>
                )}

                {mode === "wifi" && (
                  <>
                    <Field label="Network name (SSID)"><input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} className={inputCls()} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Encryption">
                        <select value={wifiEnc} onChange={(e) => setWifiEnc(e.target.value as "WPA" | "WEP" | "nopass")} className={inputCls()}>
                          <option value="WPA">WPA / WPA2 / WPA3</option>
                          <option value="WEP">WEP</option>
                          <option value="nopass">Open (no password)</option>
                        </select>
                      </Field>
                      <Field label="Hidden network">
                        <select value={wifiHidden ? "yes" : "no"} onChange={(e) => setWifiHidden(e.target.value === "yes")} className={inputCls()}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </Field>
                    </div>
                    {wifiEnc !== "nopass" && (
                      <Field label="Password"><input value={wifiPw} onChange={(e) => setWifiPw(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    )}
                    <p className="text-[0.65rem] text-muted">Standard WIFI: URI — scan to connect on modern phones.</p>
                  </>
                )}

                {mode === "sms" && (
                  <>
                    <Field label="Phone number"><input value={smsNum} onChange={(e) => setSmsNum(e.target.value)} className={inputCls("font-mono text-xs")} placeholder="+1..." /></Field>
                    <Field label="Message body"><textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className={inputCls("min-h-[80px]")} /></Field>
                  </>
                )}

                {mode === "email" && (
                  <>
                    <Field label="Email address"><input value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    <Field label="Subject (optional)"><input value={emailSub} onChange={(e) => setEmailSub(e.target.value)} className={inputCls()} /></Field>
                    <Field label="Body (optional)"><textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className={inputCls("min-h-[80px]")} /></Field>
                  </>
                )}

                {mode === "geo" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Latitude"><input value={geoLat} onChange={(e) => setGeoLat(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                      <Field label="Longitude"><input value={geoLng} onChange={(e) => setGeoLng(e.target.value)} className={inputCls("font-mono text-xs")} /></Field>
                    </div>
                    <p className="text-[0.65rem] text-muted">geo: URI — opens in Maps on most phones.</p>
                  </>
                )}
              </div>

              {/* Size slider + margin */}
              <div className="space-y-4 rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Dimensions
                </div>
                <Field label="Size" hint={`${size} px`}>
                  <input
                    type="range"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    min={64}
                    max={1024}
                    step={16}
                    className="w-full"
                    style={{ accentColor: "var(--tool-accent)" }}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Size (px)">
                    <input type="number" value={size} onChange={(e) => setSize(e.target.value)} className={inputCls()} min="64" max="1024" step="16" />
                  </Field>
                  <Field label="Margin (cells)">
                    <input type="number" value={margin} onChange={(e) => setMargin(e.target.value)} className={inputCls()} min="0" max="10" step="1" />
                  </Field>
                </div>
              </div>

              {/* Colors */}
              <div className="space-y-4 rounded-xl border border-app bg-app p-4">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Colors
                </div>

                {/* token-aware swatches */}
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {presetSwatches.map((p) => {
                    const active = p.fg === dark && p.bg === light;
                    return (
                      <button
                        key={p.label}
                        onClick={() => { setDark(p.fg); setLight(p.bg); }}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                          active
                            ? "border-tool-accent bg-tool-accent-soft"
                            : "border-app bg-app-elevated hover:border-tool-accent"
                        }`}
                        aria-label={`Color preset ${p.label}`}
                      >
                        <div className="flex h-6 w-full overflow-hidden rounded border border-app">
                          <div className="h-full flex-1" style={{ backgroundColor: p.fg }} />
                          <div className="h-full flex-1" style={{ backgroundColor: p.bg }} />
                        </div>
                        <span className={`font-mono text-[0.55rem] uppercase tracking-[0.14em] ${active ? "text-tool-accent" : "text-muted"}`}>
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Foreground" hint={dark}>
                    <div className="flex items-center gap-2">
                      <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} className="h-10 w-12 cursor-pointer rounded-md border border-app bg-transparent p-1" />
                      <input value={dark} onChange={(e) => setDark(e.target.value)} className={inputCls("flex-1 font-mono text-xs")} />
                    </div>
                  </Field>
                  <Field label="Background" hint={light}>
                    <div className="flex items-center gap-2">
                      <input type="color" value={light} onChange={(e) => setLight(e.target.value)} className="h-10 w-12 cursor-pointer rounded-md border border-app bg-transparent p-1" />
                      <input value={light} onChange={(e) => setLight(e.target.value)} className={inputCls("flex-1 font-mono text-xs")} />
                    </div>
                  </Field>
                </div>
              </div>

              {/* Error correction pills */}
              <div className="space-y-3 rounded-xl border border-app bg-app p-4">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Error correction
                  </div>
                  {logoSrc && (
                    <div className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-amber-500">
                      use H with logo
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {eclLevels.map(({ k, label, pct }) => (
                    <button
                      key={k}
                      onClick={() => setEcl(k)}
                      className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                        ecl === k
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
                      }`}
                    >
                      <div className="text-sm font-bold">{label}</div>
                      <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-wider opacity-70">{pct}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo overlay slot */}
              <div className="space-y-3 rounded-xl border border-dashed border-app bg-app p-4">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    Center logo
                  </div>
                  <div className="font-mono text-[0.6rem] text-muted">
                    {logoSrc ? `${logoSize}% of code` : "PNG / SVG"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-app bg-app-elevated">
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoSrc} alt="logo" className="h-full w-full object-contain" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 16l4-4 4 4 4-6 4 6M4 4h16v16H4z" /></svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onLogo(e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-secondary file:mr-3 file:rounded-md file:border file:border-tool-accent file:bg-tool-accent-soft file:px-3 file:py-1.5 file:font-mono file:text-[0.6rem] file:font-medium file:uppercase file:tracking-[0.14em] file:text-tool-accent hover:file:opacity-90"
                    />
                    {logoSrc && (
                      <button
                        onClick={() => setLogoSrc(null)}
                        className="mt-2 rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                      >
                        clear logo
                      </button>
                    )}
                  </div>
                </div>
                {logoSrc && (
                  <div>
                    <div className="mb-1 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                      <span>Logo scale</span>
                      <span>{logoSize}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={30}
                      value={logoSize}
                      onChange={(e) => setLogoSize(parseInt(e.target.value))}
                      className="w-full"
                      style={{ accentColor: "var(--tool-accent)" }}
                    />
                  </div>
                )}
              </div>
            </div>
          </ToolCard>
        </div>
      </ToolShell>
    </div>
  );
}
