"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Poster Creator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   2026-05-27 (Agent D): rebuilt on top of the new template registry at
   `lib/poster/registry.ts`. The rendering engine (canvas + html2canvas-pro
   export + branding bar + agent-detail Supabase persistence) is reused
   verbatim from the property-poster-creator predecessor; what's different
   is that templates are now industry-keyed and the form is generated from
   each template's `fields` declaration instead of being hardcoded around
   the real-estate field schema.

   Industry picker (top-right) defaults to workspace.industry via
   `usePosterIndustry()` (with graceful fallback to "generic"). Currency
   reads from `useWorkspaceCurrency()` and is forwarded to every template
   so prices render as `{CUR} {amount}` regardless of locale.
═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUserPreferences } from "@/lib/useUserPreferences";
import { useWorkspace } from "@/lib/workspaces/client";
import MintShareButton from "@/app/(share)/_components/MintShareButton";
import type { PageBlock, PagePayload } from "@/lib/toshare/types";
import type { NativeAppProps } from "../_data/tools-list";

import type {
  PosterBranding,
  PosterData,
  PosterField,
  PosterFormat,
  PosterImage,
  PosterIndustry,
  PosterTemplate,
} from "@/lib/poster/types";
import { POSTER_INDUSTRIES } from "@/lib/poster/types";
import { getTemplatesForIndustry } from "@/lib/poster/registry";
import { usePosterIndustry, useWorkspaceCurrency } from "@/lib/poster/useIndustry";

const PANEL_BREAKPOINT = 960;

/* ─────────── Image slot — upload, drag, zoom (unchanged from predecessor) ─────────── */

function ImageSlot({
  image,
  onChange,
  onRemove,
  label,
  className,
  aspect,
  circular,
}: {
  image: PosterImage | null;
  onChange: (img: PosterImage) => void;
  onRemove: () => void;
  label: string;
  className?: string;
  aspect?: string;
  circular?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; imgX: number; imgY: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") onChange({ src: reader.result, x: 50, y: 50, scale: 1 });
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!image) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, imgX: image.x, imgY: image.y };
    },
    [image]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !image || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
      onChange({
        ...image,
        x: Math.max(0, Math.min(100, dragRef.current.imgX - dx)),
        y: Math.max(0, Math.min(100, dragRef.current.imgY - dy)),
      });
    },
    [image, onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!image) return;
      e.preventDefault();
      onChange({ ...image, scale: Math.max(1, Math.min(3, image.scale + (e.deltaY > 0 ? -0.05 : 0.05))) });
    },
    [image, onChange]
  );

  if (!image) {
    return (
      <div className={`relative ${className || ""}`}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed transition-colors rounded-lg ${
            dragOver ? "border-tool-accent bg-tool-accent-soft" : "border-app bg-app-elevated hover:border-tool-accent hover:bg-tool-accent-soft"
          } ${circular ? "rounded-full" : ""} ${aspect || "aspect-[4/3]"} w-full`}
        >
          <svg className="mb-2 h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16v-8m0 0-3 3m3-3 3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>
          <span className="text-[0.7rem] text-muted">{label}</span>
          <span className="mt-0.5 text-[0.6rem] text-faint">Click or drop</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ""}`}>
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-lg ring-1 ring-[var(--border)] ${circular ? "rounded-full" : ""} ${
          aspect || "aspect-[4/3]"
        } w-full cursor-grab active:cursor-grabbing`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={label}
          draggable={false}
          className="pointer-events-none absolute h-full w-full select-none"
          style={{
            objectFit: "cover",
            objectPosition: `${image.x}% ${image.y}%`,
            transform: `scale(${image.scale})`,
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={image.scale}
          onChange={(e) => onChange({ ...image, scale: parseFloat(e.target.value) })}
          className="h-1 flex-1 cursor-pointer appearance-none rounded bg-app-elevated accent-[var(--tool-accent)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--tool-accent)]"
        />
        <span className="text-[0.6rem] tabular-nums text-muted w-8 text-right">{Math.round(image.scale * 100)}%</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:text-tool-accent hover:bg-tool-accent-soft transition-colors"
          title="Replace"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Remove"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}

/* ─────────── Form primitives ─────────── */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.18em] text-muted font-medium">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none transition-all focus:border-tool-accent focus:ring-1 focus:ring-tool-accent placeholder:text-faint resize-y"
      />
    );
  }
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none transition-all focus:border-tool-accent focus:ring-1 focus:ring-tool-accent placeholder:text-faint"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none transition-all focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
    >
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-app-elevated text-app">
          {opt}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <div
        className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-tool-accent" : "bg-app-elevated border border-app"}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 h-3 w-3 rounded-full transition-all bg-white shadow ${checked ? "left-[14px]" : "left-0.5"}`} />
      </div>
      <span className="text-[0.75rem] text-secondary">{label}</span>
    </label>
  );
}

/* ─────────── Field renderer ─────────── */

function FieldEditor({
  field,
  value,
  currency,
  onChange,
}: {
  field: PosterField;
  value: PosterData[string];
  currency: string;
  onChange: (v: PosterData[string]) => void;
}) {
  if (field.type === "image") {
    const img = (value as PosterImage | null) ?? null;
    return (
      <FormField label={field.label}>
        <ImageSlot
          image={img}
          onChange={(img) => onChange(img)}
          onRemove={() => onChange(null)}
          label={field.placeholder || `Upload ${field.label.toLowerCase()}`}
        />
      </FormField>
    );
  }
  if (field.type === "enum" && field.enumOptions) {
    return (
      <FormField label={field.label}>
        <SelectInput value={String(value ?? "")} onChange={onChange} options={field.enumOptions} />
      </FormField>
    );
  }
  if (field.type === "multiline") {
    return (
      <FormField label={field.label}>
        <TextInput value={String(value ?? "")} onChange={onChange} placeholder={field.placeholder} multiline />
      </FormField>
    );
  }
  if (field.type === "price") {
    return (
      <FormField label={`${field.label} (${currency})`}>
        <TextInput value={String(value ?? "")} onChange={onChange} placeholder={field.placeholder} />
      </FormField>
    );
  }
  if (field.type === "number") {
    return (
      <FormField label={field.label}>
        <TextInput value={String(value ?? "")} onChange={onChange} placeholder={field.placeholder} type="number" />
      </FormField>
    );
  }
  return (
    <FormField label={field.label}>
      <TextInput value={String(value ?? "")} onChange={onChange} placeholder={field.placeholder} />
    </FormField>
  );
}

/* ─────────── Saved branding (localStorage + Supabase auth metadata) ─────────── */

const POSTER_AGENT_KEY = "poster_agent_details";

interface SavedBranding {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  companyName: string;
  contactPhoto: PosterImage | null;
  logoImage: PosterImage | null;
  showContactPhoto: boolean;
  showLogo: boolean;
}

interface LegacyBranding {
  agentName?: string;
  agentPhone?: string;
  agentEmail?: string;
  companyName?: string;
  agentPhoto?: PosterImage | null;
  logoImage?: PosterImage | null;
  showAgentPhoto?: boolean;
  showLogo?: boolean;
}

function loadBrandingFromLS(): Partial<SavedBranding> {
  try {
    const raw = localStorage.getItem(POSTER_AGENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedBranding> & LegacyBranding;
      // Migrate from old `agentName` shape used by property-poster-creator
      if (parsed && typeof parsed === "object" && "agentName" in parsed) {
        return {
          contactName: parsed.agentName,
          contactPhone: parsed.agentPhone,
          contactEmail: parsed.agentEmail,
          companyName: parsed.companyName,
          contactPhoto: parsed.agentPhoto,
          logoImage: parsed.logoImage,
          showContactPhoto: parsed.showAgentPhoto,
          showLogo: parsed.showLogo,
        };
      }
      return parsed;
    }
  } catch {}
  return {};
}

function saveBrandingToLS(b: SavedBranding) {
  try {
    localStorage.setItem(POSTER_AGENT_KEY, JSON.stringify(b));
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════════════════ */

export default function PosterCreatorApp({ width, initialParams, initialParamsKey }: NativeAppProps) {
  const { prefs } = useUserPreferences();
  const { current: currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace.kind === "team" ? currentWorkspace.id : undefined;

  const { industry, setIndustry } = usePosterIndustry();
  const { currency, setCurrency } = useWorkspaceCurrency();

  const isMobile = width < 700;
  const isNarrow = width < PANEL_BREAKPOINT || isMobile;

  // Templates for the active industry. If empty, the picker still lists
  // industry options + we render an empty-state below.
  const templates = useMemo(() => getTemplatesForIndustry(industry), [industry]);

  // Selected template — auto-pick the first when industry changes.
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => templates[0]?.id ?? "");
  useEffect(() => {
    if (!templates.find((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }
  }, [templates, selectedTemplateId]);

  const template: PosterTemplate | undefined = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? templates[0],
    [templates, selectedTemplateId]
  );

  // Per-template field data. Keyed by templateId so switching templates
  // doesn't blow away in-progress edits on the previous one.
  const [dataByTemplate, setDataByTemplate] = useState<Record<string, PosterData>>({});
  const data: PosterData = useMemo(() => {
    if (!template) return {};
    const existing = dataByTemplate[template.id];
    if (existing) return existing;
    return { ...template.defaultData };
  }, [template, dataByTemplate]);

  const updateField = useCallback(
    (key: string, value: PosterData[string]) => {
      if (!template) return;
      setDataByTemplate((prev) => ({
        ...prev,
        [template.id]: { ...(prev[template.id] ?? template.defaultData), [key]: value },
      }));
    },
    [template]
  );

  const handleReset = useCallback(() => {
    if (!template) return;
    setDataByTemplate((prev) => ({ ...prev, [template.id]: { ...template.defaultData } }));
  }, [template]);

  /* ─── Branding (shared across all templates) ─── */

  const [branding, setBranding] = useState<SavedBranding>(() => {
    const saved = loadBrandingFromLS();
    return {
      contactName: saved.contactName || prefs.agentName || "",
      contactPhone: saved.contactPhone || prefs.agentPhone || "",
      contactEmail: saved.contactEmail || "",
      companyName: saved.companyName || prefs.companyName || "",
      contactPhoto: saved.contactPhoto || null,
      logoImage: saved.logoImage || null,
      showContactPhoto: saved.showContactPhoto ?? true,
      showLogo: saved.showLogo ?? true,
    };
  });

  const updateBranding = useCallback(<K extends keyof SavedBranding>(key: K, value: SavedBranding[K]) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  }, []);

  const supabaseSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggedIn = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadFromSupabase() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        isLoggedIn.current = true;
        const cloud = user.user_metadata?.poster_agent_details as Partial<SavedBranding> | undefined;
        if (cloud) {
          setBranding((prev) => ({
            ...prev,
            contactName: cloud.contactName ?? prev.contactName,
            contactPhone: cloud.contactPhone ?? prev.contactPhone,
            contactEmail: cloud.contactEmail ?? prev.contactEmail,
            companyName: cloud.companyName ?? prev.companyName,
            contactPhoto: cloud.contactPhoto ?? prev.contactPhoto,
            logoImage: cloud.logoImage ?? prev.logoImage,
            showContactPhoto: cloud.showContactPhoto ?? prev.showContactPhoto,
            showLogo: cloud.showLogo ?? prev.showLogo,
          }));
        }
      } catch {}
    }
    loadFromSupabase();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveBrandingToLS(branding);
    if (supabaseSaveTimer.current) clearTimeout(supabaseSaveTimer.current);
    supabaseSaveTimer.current = setTimeout(async () => {
      if (!isLoggedIn.current) return;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { poster_agent_details: branding } });
      } catch {}
    }, 1000);
  }, [branding]);

  /* ─── CRM hand-off prefill (preserves the old openApp() contract) ─── */
  useEffect(() => {
    if (!initialParams || typeof initialParams !== "object" || !template) return;
    const p = initialParams as Record<string, unknown>;
    setDataByTemplate((prev) => {
      const next: PosterData = { ...(prev[template.id] ?? template.defaultData) };
      const map: Record<string, string[]> = {
        propertyTitle: ["propertyTitle", "title"],
        location: ["location"],
        price: ["price"],
        bedrooms: ["bedrooms"],
        bathrooms: ["bathrooms"],
        area: ["area"],
        features: ["features", "description"],
        statusLabel: ["statusLabel", "badge"],
        propertyType: ["propertyType"],
      };
      for (const [src, targets] of Object.entries(map)) {
        const v = p[src];
        if (typeof v === "string" && v.trim()) {
          for (const t of targets) {
            if (t in template.defaultData) next[t] = v;
          }
        }
      }
      const newBranding: Partial<SavedBranding> = {};
      if (typeof p.agentName === "string") newBranding.contactName = p.agentName;
      if (typeof p.agentPhone === "string") newBranding.contactPhone = p.agentPhone;
      if (typeof p.agentEmail === "string") newBranding.contactEmail = p.agentEmail;
      if (typeof p.companyName === "string") newBranding.companyName = p.companyName;
      if (Object.keys(newBranding).length > 0) {
        setBranding((prev) => ({ ...prev, ...newBranding }));
      }
      return { ...prev, [template.id]: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParamsKey]);

  /* ─── Refs + format ─── */

  const posterRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);

  const [downloadFormat, setDownloadFormat] = useState<"jpg" | "png" | "story">("jpg");
  const [exporting, setExporting] = useState(false);

  const currentFormat: PosterFormat = downloadFormat === "story" ? "story" : "post";
  const activeRef = currentFormat === "story" ? storyRef : posterRef;
  const isSquare = template?.id === "re-bold-gradient" || template?.id === "generic-sale";
  const sizeChip =
    currentFormat === "story" ? "1080 × 1920" : isSquare ? "1080 × 1080" : "1080 × 1350";

  const brandingForRender: PosterBranding = useMemo(
    () => ({
      contactName: branding.contactName,
      contactPhone: branding.contactPhone,
      contactEmail: branding.contactEmail,
      companyName: branding.companyName,
      contactPhoto: branding.contactPhoto,
      logoImage: branding.logoImage,
      showContactPhoto: branding.showContactPhoto,
      showLogo: branding.showLogo,
    }),
    [branding]
  );

  const handleExport = useCallback(async () => {
    if (!activeRef.current || !template) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const el = activeRef.current;
      const rect = el.getBoundingClientRect();
      const scale = 2160 / rect.width;
      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });
      const link = document.createElement("a");
      const titleish =
        (typeof data.title === "string" && data.title) ? data.title :
        (typeof data.propertyTitle === "string" && data.propertyTitle) ? data.propertyTitle :
        template.name;
      const slug = titleish.replace(/\s+/g, "-").toLowerCase().slice(0, 60);
      const ext = downloadFormat === "png" ? "png" : "jpg";
      const suffix = downloadFormat === "story" ? "story" : "poster";
      link.download = `${slug}-${suffix}.${ext}`;
      link.href = canvas.toDataURL(downloadFormat === "png" ? "image/png" : "image/jpeg", 0.95);
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [activeRef, data, downloadFormat, template]);

  /* ─── Share payload (rasterize live poster, upload, mint toshare page) ─── */
  const buildSharePayload = useCallback(async (): Promise<PagePayload> => {
    const titleish =
      (typeof data.title === "string" ? data.title : "") ||
      (typeof data.propertyTitle === "string" ? data.propertyTitle : "") ||
      template?.name ||
      "Poster";

    const ctaHref = branding.contactEmail
      ? `mailto:${branding.contactEmail}?subject=${encodeURIComponent(titleish)}`
      : branding.contactPhone
        ? `tel:${branding.contactPhone.replace(/\s+/g, "")}`
        : undefined;

    let posterImageUrl: string | undefined;
    if (activeRef.current) {
      try {
        const html2canvas = (await import("html2canvas-pro")).default;
        const el = activeRef.current;
        const rect = el.getBoundingClientRect();
        const scale = Math.min(2160 / Math.max(rect.width, 1), 3);
        const canvas = await html2canvas(el, { scale, useCORS: true, allowTaint: true, backgroundColor: null, logging: false });
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        if (blob) {
          const slug = titleish.replace(/\s+/g, "-").toLowerCase().slice(0, 60);
          const fd = new FormData();
          fd.set("file", blob, `${slug}.jpg`);
          const res = await fetch("/api/toshare/upload-image", { method: "POST", body: fd });
          const j = await res.json();
          if (res.ok && typeof j.url === "string") posterImageUrl = j.url;
        }
      } catch (err) {
        console.warn("[poster-share] rasterize failed:", err);
      }
    }

    if (posterImageUrl) {
      return {
        title: titleish,
        posterImage: posterImageUrl,
        blocks: [],
        ctaLabel: ctaHref ? "Contact" : undefined,
        ctaHref,
        brandLogo: branding.logoImage?.src,
      };
    }

    // Fallback: data-driven blocks
    const blocks: PageBlock[] = [];
    if (typeof data.description === "string" && data.description) {
      blocks.push({ kind: "paragraph", text: data.description });
    }
    if (typeof data.price === "string" && data.price) {
      blocks.push({ kind: "stats", items: [{ label: "Price", value: `${currency} ${data.price}` }] });
    }
    const contactLine = [branding.contactName, branding.contactPhone, branding.contactEmail, branding.companyName]
      .filter(Boolean)
      .join(" · ");
    if (contactLine) {
      blocks.push({ kind: "heading", text: "Contact", level: 2 });
      blocks.push({ kind: "paragraph", text: contactLine });
    }
    return { title: titleish, blocks, ctaLabel: ctaHref ? "Contact" : undefined, ctaHref, brandLogo: branding.logoImage?.src };
  }, [activeRef, data, branding, currency, template]);

  const titleStr =
    (typeof data.title === "string" ? data.title : "") ||
    (typeof data.propertyTitle === "string" ? data.propertyTitle : "") ||
    "";
  const hasImage =
    (data.image1 && typeof data.image1 === "object") ||
    (data.propertyImage && typeof data.propertyImage === "object");
  const canShare = Boolean(titleStr.trim() || hasImage);

  /* ─── Side-panel content ─── */

  const [activePanel, setActivePanel] = useState<"content" | "branding">("content");

  // Group fields by `group`
  const groupedFields = useMemo(() => {
    if (!template) return new Map<string, PosterField[]>();
    const groups = new Map<string, PosterField[]>();
    for (const f of template.fields) {
      const g = f.group || "Content";
      const list = groups.get(g) ?? [];
      list.push(f);
      groups.set(g, list);
    }
    return groups;
  }, [template]);

  /* ─── Render ─── */

  if (!template) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app text-secondary p-8 text-center">
        <div>
          <p>No templates registered for the selected industry yet.</p>
          <p className="mt-2 text-[0.7rem]">Pick another industry from the dropdown above.</p>
        </div>
      </div>
    );
  }

  const Render = template.Render;

  const sidePanel = (
    <aside className={`flex-shrink-0 bg-app ${isNarrow ? "w-full border-t border-app" : "w-[340px] border-l border-app"}`}>
      <div className="flex border-b border-app px-2 pt-2 gap-1">
        {(
          [
            { id: "content" as const, label: "Content" },
            { id: "branding" as const, label: "Branding" },
          ]
        ).map((t) => {
          const active = activePanel === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActivePanel(t.id)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[0.7rem] font-medium transition-colors rounded-t-lg ${
                active ? "text-tool-accent" : "text-muted hover:text-app hover:bg-app-elevated"
              }`}
            >
              {t.label}
              {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-tool-accent rounded-t-full" />}
            </button>
          );
        })}
      </div>

      <div className="p-4 overflow-y-auto scrollbar-thin" style={{ maxHeight: isNarrow ? "60vh" : "calc(100% - 48px)" }}>
        {activePanel === "content" && (
          <div className="space-y-4">
            {Array.from(groupedFields.entries()).map(([group, fields]) => (
              <div key={group} className="space-y-3">
                <p className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-faint">{group}</p>
                <div className="space-y-3">
                  {fields.map((f) => (
                    <FieldEditor
                      key={f.key}
                      field={f}
                      value={data[f.key]}
                      currency={currency}
                      onChange={(v) => updateField(f.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activePanel === "branding" && (
          <div className="space-y-3">
            <FormField label="Currency">
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="AED · PKR · USD · INR"
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none focus:border-tool-accent focus:ring-1 focus:ring-tool-accent"
              />
            </FormField>
            <FormField label="Contact Name">
              <TextInput value={branding.contactName} onChange={(v) => updateBranding("contactName", v)} placeholder="Your name" />
            </FormField>
            <FormField label="Phone">
              <TextInput value={branding.contactPhone} onChange={(v) => updateBranding("contactPhone", v)} placeholder="+92 300 123 4567" />
            </FormField>
            <FormField label="Email">
              <TextInput value={branding.contactEmail} onChange={(v) => updateBranding("contactEmail", v)} placeholder="hello@yourbrand.com" />
            </FormField>
            <FormField label="Company">
              <TextInput value={branding.companyName} onChange={(v) => updateBranding("companyName", v)} placeholder="Your brand" />
            </FormField>
            <div className="space-y-2 rounded-lg border border-app bg-app-elevated p-3">
              <Toggle checked={branding.showContactPhoto} onChange={(v) => updateBranding("showContactPhoto", v)} label="Show contact photo" />
              <Toggle checked={branding.showLogo} onChange={(v) => updateBranding("showLogo", v)} label="Show logo" />
            </div>
            {branding.showContactPhoto && (
              <FormField label="Contact Photo">
                <ImageSlot
                  image={branding.contactPhoto}
                  onChange={(img) => updateBranding("contactPhoto", img)}
                  onRemove={() => updateBranding("contactPhoto", null)}
                  label="Upload photo"
                  aspect="aspect-square"
                  circular
                  className="max-w-[110px]"
                />
              </FormField>
            )}
            {branding.showLogo && (
              <FormField label="Logo">
                <ImageSlot
                  image={branding.logoImage}
                  onChange={(img) => updateBranding("logoImage", img)}
                  onRemove={() => updateBranding("logoImage", null)}
                  label="Upload logo"
                  aspect="aspect-[3/1]"
                  className="max-w-[170px]"
                />
              </FormField>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div data-tool-theme="agent" data-tool="poster-creator" className="tool-shell flex h-full w-full flex-col overflow-hidden bg-app">
      {/* Top bar: industry picker (prominent) + template gallery */}
      <div className="border-b border-app bg-app-elevated px-4 py-3 flex-shrink-0 space-y-2">
        {/* Industry picker — primary control, drives which templates show below */}
        <div className="flex items-center gap-3">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-faint flex-shrink-0">
            Industry
          </span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value as PosterIndustry)}
            className="flex-shrink-0 rounded-lg border-2 border-tool-accent/40 bg-app px-3 py-1.5 text-[0.8rem] font-medium text-app outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent/30 hover:border-tool-accent transition-colors cursor-pointer"
            title="Pick your industry — switches the template pack and field schema"
          >
            {POSTER_INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.emoji} {i.label}
              </option>
            ))}
          </select>
          <span className="text-[0.65rem] text-faint hidden sm:inline">
            {templates.length} template{templates.length === 1 ? "" : "s"} available
          </span>
        </div>

        {/* Template gallery for the selected industry */}
        <div className="flex items-center gap-3">
          {!isNarrow && (
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint flex-shrink-0">Templates</span>
          )}
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mb-1 flex-1">
            {templates.map((t) => {
              const selected = selectedTemplateId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  title={t.description}
                  className={`group flex-shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.7rem] font-medium transition-all border ${
                    selected ? "border-tool-accent bg-tool-accent text-white shadow-card" : "border-app bg-app text-secondary hover:border-tool-accent hover:text-tool-accent"
                  }`}
                >
                  <span className="text-base leading-none">{t.thumbnail}</span>
                  <span className="truncate max-w-[120px]">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workspace */}
      <div className={`flex flex-1 min-h-0 ${isNarrow ? "flex-col" : "flex-row"}`}>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2 flex-shrink-0">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.7rem] text-secondary hover:bg-tool-accent-soft hover:text-tool-accent transition-colors"
              title="Reset to default content"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>
            <div className="flex items-center gap-2 text-[0.65rem] text-muted">
              <span className="hidden sm:inline">{currentFormat === "story" ? "Story" : "Post"}</span>
              <span className="rounded-md bg-app-elevated border border-app px-2 py-0.5 font-mono tabular-nums text-app">{sizeChip}</span>
            </div>
          </div>

          <div
            className="relative flex-1 min-h-0 bg-[#f3f1ec] dark:bg-[#0b0e11] overflow-auto"
            style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0)", backgroundSize: "22px 22px" }}
          >
            <div className="flex items-center justify-center min-h-[420px] p-6 lg:p-10">
              <div
                key={`${template.id}-${currentFormat}`}
                className="poster-canvas-fade shadow-2xl shadow-black/20 rounded-md overflow-hidden ring-1 ring-black/10"
                style={{
                  maxWidth: currentFormat === "story" ? "320px" : isSquare ? "440px" : "380px",
                  width: "100%",
                  fontSize: currentFormat === "story" ? "14px" : "15px",
                }}
              >
                <Render data={data} posterRef={activeRef} format={currentFormat} currency={currency} branding={brandingForRender} />
              </div>
            </div>
          </div>

          <div className="border-t border-app bg-app-elevated px-4 py-3 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-lg border border-app bg-app p-0.5">
                {(
                  [
                    { id: "jpg" as const, label: "JPG" },
                    { id: "png" as const, label: "PNG" },
                    { id: "story" as const, label: "IG Story" },
                  ]
                ).map((f) => {
                  const active = downloadFormat === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setDownloadFormat(f.id)}
                      className={`px-3 py-1.5 text-[0.7rem] font-medium rounded-md transition-all ${active ? "bg-tool-accent text-white shadow-sm" : "text-secondary hover:text-app hover:bg-app-elevated"}`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <span className="inline-flex items-center rounded-full bg-tool-accent-soft px-2.5 py-1 text-[0.65rem] font-medium text-tool-accent font-mono tabular-nums">
                {sizeChip}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleExport}
                disabled={exporting}
                className="group inline-flex items-center gap-2 rounded-lg bg-tool-accent px-5 py-2.5 text-xs font-semibold text-white shadow-card transition-all hover:brightness-110 hover:shadow-elevated disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-app pt-3">
              <div className="flex flex-col">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-faint">Share as public page</span>
                <span className="text-[0.65rem] text-muted">Mints a toshare.net link any browser can open.</span>
              </div>
              <div className="flex-1" />
              <MintShareButton
                type="page"
                payload={async () => (await buildSharePayload()) as unknown as Record<string, unknown>}
                sourceTool="poster-creator"
                workspaceId={workspaceId}
                disabled={!canShare}
                label="Share link"
                variant="ghost"
                resetKey={`${selectedTemplateId}|${titleStr}|${currency}`}
              />
            </div>
          </div>
        </div>

        {sidePanel}
      </div>

      <style jsx global>{`
        @keyframes poster-canvas-fade-kf {
          0% { opacity: 0; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1); }
        }
        .poster-canvas-fade {
          animation: poster-canvas-fade-kf 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .poster-canvas-fade { animation: none; }
        }
      `}</style>
    </div>
  );
}
