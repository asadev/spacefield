"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Property Poster Creator — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. Stripped of AuthGate,
   frame=1 logic, PageHeader, back-links, ToolRecommendations and the bespoke
   macOS chrome — the Window component already provides all that.

   All six templates, the canvas/photo logic, html2canvas-pro export,
   Supabase agent-detail persistence, and useUserPreferences hydration are
   preserved verbatim from page.tsx. Layout is width-driven: the right
   side-panel collapses below the canvas when width < 960.
═══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserPreferences } from "@/lib/useUserPreferences";
import type { NativeAppProps } from "../_data/tools-list";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// Width threshold below which the right-side panel stacks under the canvas.
const PANEL_BREAKPOINT = 960;

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

interface ImageState {
  src: string;
  x: number;
  y: number;
  scale: number;
}

interface PosterData {
  propertyTitle: string;
  propertyType: string;
  location: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  area: string;
  features: string;
  statusLabel: string;
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  companyName: string;
  propertyImage: ImageState | null;
  propertyImage2: ImageState | null;
  propertyImage3: ImageState | null;
  agentPhoto: ImageState | null;
  logoImage: ImageState | null;
  showAgentPhoto: boolean;
  showLogo: boolean;
  showQR: boolean;
}

type TemplateId =
  | "luxury-dark"
  | "modern-light"
  | "elegant-gold"
  | "bold-gradient"
  | "minimal-clean"
  | "multi-photo";

type PosterFormat = "poster" | "story";
type DownloadFormat = "jpg" | "png" | "story";

interface TemplateConfig {
  id: TemplateId;
  name: string;
  description: string;
  preview: string;
}

const TEMPLATES: TemplateConfig[] = [
  { id: "luxury-dark", name: "Luxury Dark", description: "Full-bleed hero image with dark overlay. Perfect for luxury villas & penthouses.", preview: "🏙️" },
  { id: "modern-light", name: "Modern Light", description: "Clean white layout with bold typography. Great for apartments & townhouses.", preview: "🏢" },
  { id: "elegant-gold", name: "Elegant Gold", description: "Gold accents on dark base. Ideal for premium off-plan & new launches.", preview: "✨" },
  { id: "bold-gradient", name: "Bold Gradient", description: "Vibrant gradient frame with strong CTA. Best for social media posts.", preview: "🎨" },
  { id: "minimal-clean", name: "Minimal Clean", description: "Minimalist design with maximum impact. Works for any property type.", preview: "◻️" },
  { id: "multi-photo", name: "Multi-Photo", description: "3-photo grid layout. Perfect when you have multiple angles to show.", preview: "📸" },
];

const STATUS_OPTIONS = ["FOR SALE", "FOR RENT", "JUST LISTED", "JUST SOLD", "EXCLUSIVE", "NEW LAUNCH", "OFF PLAN", "PRICE REDUCED", "OPEN HOUSE", "UNDER OFFER"];
const PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse", "Studio", "Duplex", "Commercial", "Land", "Office"];

const DEFAULT_DATA: PosterData = {
  propertyTitle: "Stunning Waterfront Residence",
  propertyType: "Apartment",
  location: "Dubai Marina, Dubai",
  price: "2,500,000",
  bedrooms: "2",
  bathrooms: "3",
  area: "1,450",
  features: "Sea View • High Floor • Smart Home",
  statusLabel: "FOR SALE",
  agentName: "",
  agentPhone: "",
  agentEmail: "",
  companyName: "",
  propertyImage: null,
  propertyImage2: null,
  propertyImage3: null,
  agentPhoto: null,
  logoImage: null,
  showAgentPhoto: true,
  showLogo: true,
  showQR: false,
};

/* ═══════════════════════════════════════════
   IMAGE SLOT — upload, drag, zoom
   ═══════════════════════════════════════════ */

function ImageSlot({
  image, onChange, onRemove, label, className, aspect, circular,
}: {
  image: ImageState | null;
  onChange: (img: ImageState) => void;
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
    [onChange],
  );

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) handleFile(file); }, [handleFile]);
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }, [handleFile]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!image) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, imgX: image.x, imgY: image.y };
  }, [image]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !image || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    onChange({ ...image, x: Math.max(0, Math.min(100, dragRef.current.imgX - dx)), y: Math.max(0, Math.min(100, dragRef.current.imgY - dy)) });
  }, [image, onChange]);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!image) return;
    onChange({ ...image, scale: Math.max(1, Math.min(3, image.scale + (e.deltaY > 0 ? -0.05 : 0.05))) });
  }, [image, onChange]);

  if (!image) {
    return (
      <div className={`relative ${className || ""}`}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed transition-colors rounded-lg ${dragOver ? "border-tool-accent bg-tool-accent-soft" : "border-app bg-app-elevated hover:border-tool-accent hover:bg-tool-accent-soft"} ${circular ? "rounded-full" : ""} ${aspect || "aspect-[4/3]"} w-full`}
        >
          <svg className="mb-2 h-7 w-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0-3 3m3-3 3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
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
        className={`relative overflow-hidden rounded-lg ring-1 ring-[var(--border)] ${circular ? "rounded-full" : ""} ${aspect || "aspect-[4/3]"} w-full cursor-grab active:cursor-grabbing`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}
      >
        <img src={image.src} alt={label} draggable={false} className="pointer-events-none absolute h-full w-full select-none" style={{ objectFit: "cover", objectPosition: `${image.x}% ${image.y}%`, transform: `scale(${image.scale})` }} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="range" min={1} max={3} step={0.01} value={image.scale} onChange={(e) => onChange({ ...image, scale: parseFloat(e.target.value) })} className="h-1 flex-1 cursor-pointer appearance-none rounded bg-app-elevated accent-[var(--tool-accent)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--tool-accent)]" />
        <span className="text-[0.6rem] tabular-nums text-muted w-8 text-right">{Math.round(image.scale * 100)}%</span>
        <button onClick={() => fileRef.current?.click()} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:text-tool-accent hover:bg-tool-accent-soft transition-colors" title="Replace">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
        </button>
        <button onClick={onRemove} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Remove">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}

/* ═══════════════════════════════════════════
   POSTER IMAGE — rendered inside poster
   ═══════════════════════════════════════════ */

function PosterImage({ image, className, style }: { image: ImageState | null; className?: string; style?: React.CSSProperties }) {
  if (!image) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 ${className || ""}`} style={style}>
        <svg className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden ${className || ""}`} style={style}>
      <img src={image.src} alt="" className="h-full w-full pointer-events-none select-none" style={{ objectFit: "cover", objectPosition: `${image.x}% ${image.y}%`, transform: `scale(${image.scale})` }} />
    </div>
  );
}

/* SVG Icons */
const LocationPin = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 1 1 9.9 9.9L10 18.9l-4.95-4.95a7 7 0 0 1 0-9.9ZM10 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" clipRule="evenodd" />
  </svg>
);

/* ═══════════════════════════════════════════
   SHARED: Agent Footer Bar
   ═══════════════════════════════════════════ */

function AgentBar({ data, theme }: { data: PosterData; theme: "dark" | "light" | "gold" | "gradient" }) {
  const colors = {
    dark: { name: "text-white", phone: "text-white/60", company: "text-white/50", border: "border-white/10", photoBorder: "border-white/20" },
    light: { name: "text-[#1a1a2e]", phone: "text-gray-400", company: "text-gray-400", border: "border-gray-200", photoBorder: "border-gray-200" },
    gold: { name: "text-white", phone: "text-[#c9a96e]/60", company: "text-[#c9a96e]/50", border: "border-[#c9a96e]/20", photoBorder: "border-[#c9a96e]/40" },
    gradient: { name: "text-white", phone: "text-white/60", company: "text-white/50", border: "border-white/20", photoBorder: "border-white/30" },
  }[theme];

  return (
    <div className={`flex items-center gap-[0.6em] border-t ${colors.border} pt-[0.6em]`}>
      {data.showAgentPhoto && data.agentPhoto && (
        <div className={`h-[2.4em] w-[2.4em] overflow-hidden rounded-full border-2 ${colors.photoBorder} flex-shrink-0`}>
          <img src={data.agentPhoto.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${data.agentPhoto.x}% ${data.agentPhoto.y}%` }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {data.agentName && <p className={`text-[0.6em] font-semibold ${colors.name} truncate`}>{data.agentName}</p>}
        <div className="flex items-center gap-[0.4em]">
          {data.agentPhone && <span className={`text-[0.45em] ${colors.phone}`}>{data.agentPhone}</span>}
          {data.agentPhone && data.companyName && <span className={`text-[0.3em] ${colors.phone}`}>|</span>}
          {data.companyName && <span className={`text-[0.45em] ${colors.company} uppercase tracking-wider`}>{data.companyName}</span>}
        </div>
      </div>
      {data.showLogo && data.logoImage && (
        <div className="h-[2.2em] w-auto flex-shrink-0">
          <img src={data.logoImage.src} alt="" className="h-full w-auto object-contain" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   STORY LAYOUT — shared across all templates
   ═══════════════════════════════════════════ */

function StoryLayout({ data, posterRef, theme }: { data: PosterData; posterRef: React.RefObject<HTMLDivElement | null>; theme: "dark" | "light" | "gold" | "gradient" }) {
  const bg = {
    dark: "bg-black",
    light: "bg-[#f8f8f5]",
    gold: "bg-[#0c0c0c]",
    gradient: "",
  }[theme];

  const gradientStyle = theme === "gradient" ? { background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" } : {};

  const statusBg = { dark: "bg-white text-black", light: "bg-[#1a1a2e] text-white", gold: "bg-[#c9a96e] text-[#0c0c0c]", gradient: "bg-white/20 backdrop-blur-sm text-white" }[theme];
  const titleColor = { dark: "text-white", light: "text-white", gold: "text-white", gradient: "text-white" }[theme];
  const priceColor = { dark: "text-white", light: "text-white", gold: "text-[#c9a96e]", gradient: "text-white" }[theme];
  const specBg = { dark: "bg-white/10", light: "bg-white/15 backdrop-blur-sm", gold: "border border-[#c9a96e]/30", gradient: "bg-white/15 backdrop-blur-sm" }[theme];
  const specText = { dark: "text-white", light: "text-white", gold: "text-[#c9a96e]", gradient: "text-white" }[theme];
  const specLabel = { dark: "text-white/50", light: "text-white/60", gold: "text-white/40", gradient: "text-white/50" }[theme];
  const locColor = { dark: "text-white/60", light: "text-white/70", gold: "text-[#c9a96e]/80", gradient: "text-white/70" }[theme];

  return (
    <div ref={posterRef} className={`relative w-full overflow-hidden ${bg}`} style={{ aspectRatio: "1080/1920", ...gradientStyle }}>
      <PosterImage image={data.propertyImage} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />
      {theme === "gold" && <div className="absolute inset-[2.5%] border border-[#c9a96e]/30 pointer-events-none z-20" />}
      {theme === "gradient" && <>
        <div className="absolute -top-[20%] -right-[20%] h-[50%] w-[50%] rounded-full bg-white/5" />
        <div className="absolute -bottom-[10%] -left-[10%] h-[35%] w-[35%] rounded-full bg-white/5" />
      </>}

      <div className="absolute top-[13%] left-[6%] right-[6%] z-10 flex items-start justify-between">
        <div className={`inline-block px-[0.8em] py-[0.3em] ${statusBg} ${theme === "gradient" ? "rounded-full" : ""}`}>
          <span className="text-[0.55em] font-bold tracking-[0.2em] uppercase">{data.statusLabel}</span>
        </div>
        {data.showLogo && data.logoImage && (
          <div className="h-[2em] w-auto">
            <img src={data.logoImage.src} alt="" className="h-full w-auto object-contain" />
          </div>
        )}
      </div>

      <div className="absolute left-[6%] right-[6%] z-10" style={{ top: "50%" }}>
        <p className={`text-[1.8em] font-bold ${priceColor} leading-none`}>AED {data.price}</p>
        <h2 className={`mt-[0.4em] text-[1.3em] font-bold leading-[1.15] ${titleColor}`}>{data.propertyTitle}</h2>
        <div className="mt-[0.25em] flex items-center gap-[0.3em]">
          <LocationPin className={`h-[0.55em] w-[0.55em] ${locColor}`} />
          <span className={`text-[0.5em] ${locColor}`}>{data.location}</span>
        </div>
        <div className="mt-[0.6em] flex gap-[0.4em]">
          {data.bedrooms && (
            <div className={`${specBg} px-[0.6em] py-[0.3em] text-center rounded`}>
              <span className={`text-[0.75em] font-bold ${specText}`}>{data.bedrooms}</span>
              <span className={`block text-[0.3em] ${specLabel} uppercase`}>Beds</span>
            </div>
          )}
          {data.bathrooms && (
            <div className={`${specBg} px-[0.6em] py-[0.3em] text-center rounded`}>
              <span className={`text-[0.75em] font-bold ${specText}`}>{data.bathrooms}</span>
              <span className={`block text-[0.3em] ${specLabel} uppercase`}>Baths</span>
            </div>
          )}
          {data.area && (
            <div className={`${specBg} px-[0.6em] py-[0.3em] text-center rounded`}>
              <span className={`text-[0.75em] font-bold ${specText}`}>{data.area}</span>
              <span className={`block text-[0.3em] ${specLabel} uppercase`}>Sqft</span>
            </div>
          )}
        </div>
        {data.features && (
          <p className="mt-[0.4em] text-[0.42em] text-white/50">{data.features}</p>
        )}
      </div>

      <div className="absolute bottom-[17%] left-[6%] right-[6%] z-10">
        <div className={`flex items-center gap-[0.6em] ${theme === "gradient" ? "bg-white/10 backdrop-blur-sm rounded-xl p-[0.5em]" : ""}`}>
          {data.showAgentPhoto && data.agentPhoto && (
            <div className="h-[2.6em] w-[2.6em] overflow-hidden rounded-full border-2 border-white/25 flex-shrink-0">
              <img src={data.agentPhoto.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${data.agentPhoto.x}% ${data.agentPhoto.y}%` }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {data.agentName && <p className="text-[0.6em] font-semibold text-white truncate">{data.agentName}</p>}
            <div className="flex items-center gap-[0.4em]">
              {data.agentPhone && <span className="text-[0.45em] text-white/55">{data.agentPhone}</span>}
              {data.agentPhone && data.companyName && <span className="text-[0.3em] text-white/30">|</span>}
              {data.companyName && <span className="text-[0.45em] text-white/45 uppercase tracking-wider">{data.companyName}</span>}
            </div>
          </div>
          {data.showLogo && data.logoImage && (
            <div className="h-[2em] w-auto flex-shrink-0">
              <img src={data.logoImage.src} alt="" className="h-full w-auto object-contain brightness-0 invert opacity-70" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE RENDERERS
   ═══════════════════════════════════════════ */

interface TemplateProps {
  data: PosterData;
  posterRef: React.RefObject<HTMLDivElement | null>;
  format: PosterFormat;
}

function TemplateLuxuryDark({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="dark" />;
  return (
    <div ref={posterRef} className="relative flex w-full flex-col overflow-hidden bg-black" style={{ aspectRatio: "1080/1350" }}>
      <PosterImage image={data.propertyImage} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
      <div className="relative z-10 p-[5%]">
        <div className="inline-block bg-white px-[1em] py-[0.35em]">
          <span className="text-[0.65em] font-bold tracking-[0.2em] text-black uppercase">{data.statusLabel}</span>
        </div>
      </div>
      <div className="flex-1" />
      <div className="relative z-10 px-[6%] pb-[6%]">
        {data.features && <p className="mb-[0.4em] text-[0.5em] tracking-[0.15em] text-white/70 uppercase">{data.features}</p>}
        <h2 className="text-[1.4em] font-bold leading-[1.15] tracking-tight text-white">{data.propertyTitle}</h2>
        <div className="mt-[0.3em] flex items-center gap-[0.3em]">
          <LocationPin className="h-[0.6em] w-[0.6em] text-white/60" />
          <span className="text-[0.55em] text-white/70">{data.location}</span>
        </div>
        <p className="mt-[0.6em] text-[1.6em] font-bold text-white">AED {data.price}</p>
        <div className="mt-[0.5em] flex gap-[1.2em]">
          {data.bedrooms && <span className="text-[0.55em] text-white/80">{data.bedrooms} Bed</span>}
          {data.bathrooms && <span className="text-[0.55em] text-white/80">{data.bathrooms} Bath</span>}
          {data.area && <span className="text-[0.55em] text-white/80">{data.area} sqft</span>}
        </div>
        <div className="mt-[0.8em]"><AgentBar data={data} theme="dark" /></div>
      </div>
    </div>
  );
}

function TemplateModernLight({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="light" />;
  return (
    <div ref={posterRef} className="flex w-full flex-col overflow-hidden bg-white" style={{ aspectRatio: "1080/1350" }}>
      <div className="bg-[#1a1a2e] py-[0.5em] text-center flex-shrink-0">
        <span className="text-[0.5em] font-bold tracking-[0.3em] text-white uppercase">{data.statusLabel}</span>
      </div>
      <div className="relative flex-shrink-0 h-[50%]"><PosterImage image={data.propertyImage} className="absolute inset-0" /></div>
      <div className="flex flex-1 flex-col justify-between p-[6%]">
        <div>
          <span className="inline-block border border-[#1a1a2e] px-[0.6em] py-[0.15em] text-[0.4em] font-semibold tracking-[0.2em] text-[#1a1a2e] uppercase">{data.propertyType}</span>
          <h2 className="mt-[0.4em] text-[1.2em] font-bold leading-[1.15] tracking-tight text-[#1a1a2e]">{data.propertyTitle}</h2>
          <div className="mt-[0.2em] flex items-center gap-[0.2em]">
            <LocationPin className="h-[0.5em] w-[0.5em] text-gray-400" />
            <span className="text-[0.5em] text-gray-500">{data.location}</span>
          </div>
          <div className="mt-[0.5em]">
            <span className="text-[0.4em] text-gray-400 uppercase tracking-wider">Price</span>
            <p className="text-[1.35em] font-bold text-[#1a1a2e]">AED {data.price}</p>
          </div>
          <div className="mt-[0.5em] flex gap-[0.5em]">
            {data.bedrooms && (<div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]"><span className="text-[0.8em] font-bold text-[#1a1a2e]">{data.bedrooms}</span><span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Beds</span></div>)}
            {data.bathrooms && (<div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]"><span className="text-[0.8em] font-bold text-[#1a1a2e]">{data.bathrooms}</span><span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Baths</span></div>)}
            {data.area && (<div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]"><span className="text-[0.8em] font-bold text-[#1a1a2e]">{data.area}</span><span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Sqft</span></div>)}
          </div>
          {data.features && <p className="mt-[0.4em] text-[0.42em] text-gray-400">{data.features}</p>}
        </div>
        <div className="mt-[0.6em]"><AgentBar data={data} theme="light" /></div>
      </div>
    </div>
  );
}

function TemplateElegantGold({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="gold" />;
  return (
    <div ref={posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0c0c0c]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-[3%] border border-[#c9a96e]/40 pointer-events-none z-20" />
      <div className="absolute inset-[4%] border border-[#c9a96e]/20 pointer-events-none z-20" />
      <div className="relative z-10 p-[6%] pb-0">
        <div className="inline-block bg-[#c9a96e] px-[0.8em] py-[0.3em]">
          <span className="text-[0.5em] font-bold tracking-[0.25em] text-[#0c0c0c] uppercase">{data.statusLabel}</span>
        </div>
      </div>
      <div className="relative mx-[6%] mt-[0.5em] flex-shrink-0 h-[42%]"><PosterImage image={data.propertyImage} className="absolute inset-0" /></div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.6em] z-10">
        <div>
          <div className="mb-[0.4em] h-px bg-gradient-to-r from-transparent via-[#c9a96e]/60 to-transparent" />
          <h2 className="text-[1.2em] font-bold leading-[1.15] text-white">{data.propertyTitle}</h2>
          <div className="mt-[0.2em] flex items-center gap-[0.3em]">
            <LocationPin className="h-[0.5em] w-[0.5em] text-[#c9a96e]" />
            <span className="text-[0.5em] text-white/60">{data.location}</span>
          </div>
          <div className="mt-[0.5em]">
            <span className="text-[0.38em] text-[#c9a96e] uppercase tracking-[0.2em]">Starting From</span>
            <p className="text-[1.35em] font-bold text-[#c9a96e]">AED {data.price}</p>
          </div>
          <div className="mt-[0.4em] flex gap-[0.4em]">
            {data.bedrooms && (<div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center"><span className="text-[0.75em] font-bold text-[#c9a96e]">{data.bedrooms}</span><span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Bedrooms</span></div>)}
            {data.bathrooms && (<div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center"><span className="text-[0.75em] font-bold text-[#c9a96e]">{data.bathrooms}</span><span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Bathrooms</span></div>)}
            {data.area && (<div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center"><span className="text-[0.75em] font-bold text-[#c9a96e]">{data.area}</span><span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Sqft</span></div>)}
          </div>
          {data.features && <p className="mt-[0.3em] text-[0.42em] text-white/40">{data.features}</p>}
        </div>
        <div className="mt-[0.6em]"><AgentBar data={data} theme="gold" /></div>
      </div>
    </div>
  );
}

function TemplateBoldGradient({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="gradient" />;
  return (
    <div ref={posterRef} className="relative flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1080", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <div className="absolute -top-[20%] -right-[20%] h-[60%] w-[60%] rounded-full bg-white/5" />
      <div className="absolute -bottom-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-white/5" />
      <div className="relative z-10 p-[5%] pb-0">
        <div className="inline-block bg-white/20 backdrop-blur-sm px-[0.8em] py-[0.3em] rounded-full">
          <span className="text-[0.55em] font-bold tracking-[0.2em] text-white uppercase">{data.statusLabel}</span>
        </div>
      </div>
      <div className="relative mx-[5%] mt-[0.5em] flex-shrink-0 rounded-2xl overflow-hidden h-[42%]"><PosterImage image={data.propertyImage} className="absolute inset-0" /></div>
      <div className="flex flex-1 flex-col justify-between p-[5%] pt-[0.5em] z-10">
        <div>
          <h2 className="text-[1.2em] font-extrabold leading-[1.15] text-white">{data.propertyTitle}</h2>
          <div className="mt-[0.2em] flex items-center gap-[0.3em]">
            <LocationPin className="h-[0.5em] w-[0.5em] text-white/70" />
            <span className="text-[0.5em] text-white/80">{data.location}</span>
          </div>
          <div className="mt-[0.4em] inline-block rounded-lg bg-white/20 backdrop-blur-sm px-[0.6em] py-[0.3em]">
            <span className="text-[1.3em] font-extrabold text-white">AED {data.price}</span>
          </div>
          <div className="mt-[0.4em] flex gap-[0.4em]">
            {data.bedrooms && (<div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm"><span className="text-[0.75em] font-bold text-white">{data.bedrooms}</span><span className="block text-[0.3em] text-white/60 uppercase">Beds</span></div>)}
            {data.bathrooms && (<div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm"><span className="text-[0.75em] font-bold text-white">{data.bathrooms}</span><span className="block text-[0.3em] text-white/60 uppercase">Baths</span></div>)}
            {data.area && (<div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm"><span className="text-[0.75em] font-bold text-white">{data.area}</span><span className="block text-[0.3em] text-white/60 uppercase">Sqft</span></div>)}
          </div>
        </div>
        <div className="mt-[0.5em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]"><AgentBar data={data} theme="gradient" /></div>
      </div>
    </div>
  );
}

function TemplateMinimalClean({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="light" />;
  return (
    <div ref={posterRef} className="flex w-full flex-col overflow-hidden bg-[#f5f5f0]" style={{ aspectRatio: "1080/1350" }}>
      <div className="flex items-center justify-between px-[6%] py-[3%] flex-shrink-0">
        <span className="text-[0.45em] font-medium tracking-[0.25em] text-[#2c2c2c] uppercase">{data.statusLabel}</span>
        {data.showLogo && data.logoImage ? (
          <div className="h-[1.5em] w-auto"><img src={data.logoImage.src} alt="" className="h-full w-auto object-contain" /></div>
        ) : data.companyName ? (
          <span className="text-[0.4em] font-medium tracking-wider text-[#2c2c2c]/50 uppercase">{data.companyName}</span>
        ) : null}
      </div>
      <div className="relative mx-[5%] flex-shrink-0 h-[44%]"><PosterImage image={data.propertyImage} className="absolute inset-0" /></div>
      <div className="flex flex-1 flex-col justify-between px-[6%] py-[4%]">
        <div>
          <div className="mb-[0.3em] h-[2px] w-[2em] bg-[#2c2c2c]" />
          <h2 className="text-[1.1em] font-bold leading-[1.15] tracking-tight text-[#2c2c2c]">{data.propertyTitle}</h2>
          <p className="mt-[0.2em] text-[0.45em] text-[#2c2c2c]/50">{data.location}</p>
          <p className="mt-[0.5em] text-[1.3em] font-light text-[#2c2c2c]">AED {data.price}</p>
          <div className="mt-[0.3em] flex items-center gap-[0.5em] text-[0.45em] text-[#2c2c2c]/60">
            {data.bedrooms && <span>{data.bedrooms} Bedrooms</span>}
            {data.bedrooms && data.bathrooms && <span className="text-[#2c2c2c]/20">|</span>}
            {data.bathrooms && <span>{data.bathrooms} Bathrooms</span>}
            {data.bathrooms && data.area && <span className="text-[#2c2c2c]/20">|</span>}
            {data.area && <span>{data.area} sqft</span>}
          </div>
          {data.features && <p className="mt-[0.3em] text-[0.38em] text-[#2c2c2c]/40">{data.features}</p>}
        </div>
        <div className="mt-[0.5em] flex items-center gap-[0.5em] border-t border-[#2c2c2c]/10 pt-[0.5em]">
          {data.showAgentPhoto && data.agentPhoto && (
            <div className="h-[2em] w-[2em] overflow-hidden rounded-full border border-[#2c2c2c]/10 flex-shrink-0">
              <img src={data.agentPhoto.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${data.agentPhoto.x}% ${data.agentPhoto.y}%` }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {data.agentName && <p className="text-[0.48em] font-medium text-[#2c2c2c] truncate">{data.agentName}</p>}
            <div className="flex items-center gap-[0.3em]">
              {data.agentPhone && <span className="text-[0.38em] text-[#2c2c2c]/40">{data.agentPhone}</span>}
              {data.agentPhone && data.companyName && <span className="text-[0.25em] text-[#2c2c2c]/20">|</span>}
              {data.companyName && <span className="text-[0.38em] text-[#2c2c2c]/40 uppercase tracking-wider">{data.companyName}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateMultiPhoto({ data, posterRef, format }: TemplateProps) {
  if (format === "story") return <StoryLayout data={data} posterRef={posterRef} theme="dark" />;
  return (
    <div ref={posterRef} className="flex w-full flex-col overflow-hidden bg-[#111]" style={{ aspectRatio: "1080/1350" }}>
      <div className="bg-white py-[0.45em] text-center flex-shrink-0">
        <span className="text-[0.5em] font-bold tracking-[0.3em] text-black uppercase">{data.statusLabel}</span>
      </div>
      <div className="relative flex-shrink-0 mx-[3%] h-[46%]">
        <PosterImage image={data.propertyImage} className="absolute top-0 left-0 bottom-0" style={{ width: "65%", borderRight: "3px solid #111" }} />
        <div className="absolute top-0 right-0 bottom-0" style={{ left: "65%" }}>
          <PosterImage image={data.propertyImage2} className="absolute top-0 left-[3px] right-0" style={{ height: "49.5%", borderBottom: "1.5px solid #111" }} />
          <PosterImage image={data.propertyImage3} className="absolute bottom-0 left-[3px] right-0" style={{ height: "49.5%", borderTop: "1.5px solid #111" }} />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[5%] pt-[0.6em]">
        <div>
          <h2 className="text-[1.1em] font-bold leading-[1.15] text-white">{data.propertyTitle}</h2>
          <div className="mt-[0.2em] flex items-center gap-[0.3em]">
            <LocationPin className="h-[0.5em] w-[0.5em] text-white/50" />
            <span className="text-[0.48em] text-white/60">{data.location}</span>
          </div>
          <p className="mt-[0.4em] text-[1.35em] font-bold text-white">AED {data.price}</p>
          <div className="mt-[0.3em] flex gap-[1em] text-[0.45em] text-white/70">
            {data.bedrooms && <span>{data.bedrooms} Bedrooms</span>}
            {data.bathrooms && <span>{data.bathrooms} Bathrooms</span>}
            {data.area && <span>{data.area} sqft</span>}
          </div>
          {data.features && <p className="mt-[0.3em] text-[0.38em] text-white/40">{data.features}</p>}
        </div>
        <div className="mt-[0.5em]"><AgentBar data={data} theme="dark" /></div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FORM COMPONENTS
   ═══════════════════════════════════════════ */

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[0.6rem] uppercase tracking-[0.18em] text-muted font-medium">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none transition-all focus:border-tool-accent focus:ring-1 focus:ring-tool-accent placeholder:text-faint" />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-[0.8rem] text-app outline-none transition-all focus:border-tool-accent focus:ring-1 focus:ring-tool-accent">
      {options.map((opt) => <option key={opt} value={opt} className="bg-app-elevated text-app">{opt}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <div className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-tool-accent" : "bg-app-elevated border border-app"}`} onClick={() => onChange(!checked)}>
        <div className={`absolute top-0.5 h-3 w-3 rounded-full transition-all bg-white shadow ${checked ? "left-[14px]" : "left-0.5"}`} />
      </div>
      <span className="text-[0.75rem] text-secondary">{label}</span>
    </label>
  );
}

/* ═══════════════════════════════════════════
   PERSISTENCE — local + supabase
   ═══════════════════════════════════════════ */

const POSTER_AGENT_KEY = "poster_agent_details";

interface SavedAgentDetails {
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  companyName: string;
  agentPhoto: ImageState | null;
  logoImage: ImageState | null;
  showAgentPhoto: boolean;
  showLogo: boolean;
}

function loadAgentDetailsFromLS(): Partial<SavedAgentDetails> {
  try {
    const raw = localStorage.getItem(POSTER_AGENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function extractAgentDetails(data: PosterData): SavedAgentDetails {
  return {
    agentName: data.agentName, agentPhone: data.agentPhone, agentEmail: data.agentEmail,
    companyName: data.companyName, agentPhoto: data.agentPhoto, logoImage: data.logoImage,
    showAgentPhoto: data.showAgentPhoto, showLogo: data.showLogo,
  };
}

function saveAgentDetailsToLS(data: PosterData) {
  try {
    localStorage.setItem(POSTER_AGENT_KEY, JSON.stringify(extractAgentDetails(data)));
  } catch {}
}

const PROPERTY_DEFAULTS = {
  propertyTitle: "Stunning Waterfront Residence",
  propertyType: "Apartment",
  location: "Dubai Marina, Dubai",
  price: "2,500,000",
  bedrooms: "2",
  bathrooms: "3",
  area: "1,450",
  features: "Sea View • High Floor • Smart Home",
  statusLabel: "FOR SALE",
  propertyImage: null as ImageState | null,
  propertyImage2: null as ImageState | null,
  propertyImage3: null as ImageState | null,
  showQR: false,
};

/* ═══════════════════════════════════════════
   MAIN NATIVE APP
   ═══════════════════════════════════════════ */

export default function PropertyPosterCreatorApp({ width }: NativeAppProps) {
  const { prefs } = useUserPreferences();
  const posterRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("luxury-dark");
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>("jpg");
  const [exporting, setExporting] = useState(false);
  const [activePanel, setActivePanel] = useState<"property" | "branding" | "photos">("property");
  const supabaseSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggedIn = useRef(false);

  // Width-driven layout — collapse the side panel below the canvas in narrow windows.
  const isNarrow = width < PANEL_BREAKPOINT;

  const [data, setData] = useState<PosterData>(() => {
    const saved = loadAgentDetailsFromLS();
    return {
      ...DEFAULT_DATA,
      agentName: saved.agentName || prefs.agentName || "",
      agentPhone: saved.agentPhone || prefs.agentPhone || "",
      agentEmail: saved.agentEmail || "",
      companyName: saved.companyName || prefs.companyName || "",
      agentPhoto: saved.agentPhoto || null,
      logoImage: saved.logoImage || null,
      showAgentPhoto: saved.showAgentPhoto ?? true,
      showLogo: saved.showLogo ?? true,
    };
  });

  useEffect(() => {
    let cancelled = false;
    async function loadFromSupabase() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      isLoggedIn.current = true;
      const cloud = user.user_metadata?.poster_agent_details as Partial<SavedAgentDetails> | undefined;
      if (cloud) {
        setData((prev) => ({
          ...prev,
          agentName: cloud.agentName || prev.agentName || "",
          agentPhone: cloud.agentPhone || prev.agentPhone || "",
          agentEmail: cloud.agentEmail || prev.agentEmail || "",
          companyName: cloud.companyName || prev.companyName || "",
          agentPhoto: cloud.agentPhoto ?? prev.agentPhoto,
          logoImage: cloud.logoImage ?? prev.logoImage,
          showAgentPhoto: cloud.showAgentPhoto ?? prev.showAgentPhoto,
          showLogo: cloud.showLogo ?? prev.showLogo,
        }));
        try {
          localStorage.setItem(POSTER_AGENT_KEY, JSON.stringify(cloud));
        } catch {}
      }
    }
    loadFromSupabase();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setData((prev) => ({
      ...prev,
      agentName: prev.agentName || prefs.agentName || "",
      agentPhone: prev.agentPhone || prefs.agentPhone || "",
      companyName: prev.companyName || prefs.companyName || "",
    }));
  }, [prefs.agentName, prefs.agentPhone, prefs.companyName]);

  useEffect(() => {
    saveAgentDetailsToLS(data);
    if (supabaseSaveTimer.current) clearTimeout(supabaseSaveTimer.current);
    supabaseSaveTimer.current = setTimeout(async () => {
      if (!isLoggedIn.current) return;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await supabase.auth.updateUser({
          data: { poster_agent_details: extractAgentDetails(data) },
        });
      } catch {}
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.agentName, data.agentPhone, data.agentEmail, data.companyName, data.agentPhoto, data.logoImage, data.showAgentPhoto, data.showLogo]);

  const updateField = useCallback(<K extends keyof PosterData>(key: K, value: PosterData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setData((prev) => ({ ...prev, ...PROPERTY_DEFAULTS }));
    setActivePanel("property");
  }, []);

  const PosterTemplate = useMemo(() => {
    const map = {
      "luxury-dark": TemplateLuxuryDark, "modern-light": TemplateModernLight, "elegant-gold": TemplateElegantGold,
      "bold-gradient": TemplateBoldGradient, "minimal-clean": TemplateMinimalClean, "multi-photo": TemplateMultiPhoto,
    };
    return map[selectedTemplate];
  }, [selectedTemplate]);

  const currentFormat: PosterFormat = downloadFormat === "story" ? "story" : "poster";
  const activeRef = currentFormat === "story" ? storyRef : posterRef;
  const sizeChip = currentFormat === "story"
    ? "1080 × 1920"
    : selectedTemplate === "bold-gradient" ? "1080 × 1080" : "1080 × 1350";

  const handleExport = useCallback(async () => {
    if (!activeRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const el = activeRef.current;
      const rect = el.getBoundingClientRect();
      const scale = 2160 / rect.width;
      const canvas = await html2canvas(el, { scale, useCORS: true, allowTaint: true, backgroundColor: null, logging: false });
      const link = document.createElement("a");
      const slug = data.propertyTitle.replace(/\s+/g, "-").toLowerCase();
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
  }, [activeRef, data.propertyTitle, downloadFormat]);

  // Side-panel content lives in its own component so we can mount it either
  // beside the canvas (wide) or stacked below it (narrow) without duplication.
  const sidePanel = (
    <aside className={`flex-shrink-0 bg-app ${isNarrow ? "w-full border-t border-app" : "w-[340px] border-l border-app"}`}>
      {/* Panel tabs */}
      <div className="flex border-b border-app px-2 pt-2 gap-1">
        {([
          { id: "property" as const, label: "Listing", icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          )},
          { id: "branding" as const, label: "Branding", icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )},
          { id: "photos" as const, label: "Photos", icon: (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )},
        ]).map((tab) => {
          const active = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[0.7rem] font-medium transition-colors rounded-t-lg ${active ? "text-tool-accent" : "text-muted hover:text-app hover:bg-app-elevated"}`}
            >
              {tab.icon}
              {tab.label}
              {active && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-tool-accent rounded-t-full" />}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="p-4 overflow-y-auto scrollbar-thin" style={{ maxHeight: isNarrow ? "60vh" : "calc(100% - 48px)" }}>
        <AnimatePresence mode="wait">
          {activePanel === "property" && (
            <motion.div key="property" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }} className="space-y-3">
              <FormField label="Status Badge">
                <SelectInput value={data.statusLabel} onChange={(v) => updateField("statusLabel", v)} options={STATUS_OPTIONS} />
              </FormField>
              <FormField label="Title">
                <TextInput value={data.propertyTitle} onChange={(v) => updateField("propertyTitle", v)} placeholder="Stunning Waterfront Residence" />
              </FormField>
              <FormField label="Type">
                <SelectInput value={data.propertyType} onChange={(v) => updateField("propertyType", v)} options={PROPERTY_TYPES} />
              </FormField>
              <FormField label="Location">
                <TextInput value={data.location} onChange={(v) => updateField("location", v)} placeholder="Dubai Marina, Dubai" />
              </FormField>
              <FormField label="Price (AED)">
                <TextInput value={data.price} onChange={(v) => updateField("price", v)} placeholder="2,500,000" />
              </FormField>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Beds"><TextInput value={data.bedrooms} onChange={(v) => updateField("bedrooms", v)} placeholder="2" /></FormField>
                <FormField label="Baths"><TextInput value={data.bathrooms} onChange={(v) => updateField("bathrooms", v)} placeholder="3" /></FormField>
                <FormField label="Sqft"><TextInput value={data.area} onChange={(v) => updateField("area", v)} placeholder="1,450" /></FormField>
              </div>
              <FormField label="Highlights">
                <TextInput value={data.features} onChange={(v) => updateField("features", v)} placeholder="Sea View • Smart Home" />
              </FormField>
            </motion.div>
          )}

          {activePanel === "branding" && (
            <motion.div key="branding" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }} className="space-y-3">
              <FormField label="Agent Name">
                <TextInput value={data.agentName} onChange={(v) => updateField("agentName", v)} placeholder="Your name" />
              </FormField>
              <FormField label="Phone">
                <TextInput value={data.agentPhone} onChange={(v) => updateField("agentPhone", v)} placeholder="+971 50 123 4567" />
              </FormField>
              <FormField label="Email">
                <TextInput value={data.agentEmail} onChange={(v) => updateField("agentEmail", v)} placeholder="agent@company.com" />
              </FormField>
              <FormField label="Company">
                <TextInput value={data.companyName} onChange={(v) => updateField("companyName", v)} placeholder="Your brokerage" />
              </FormField>
              <div className="space-y-2 rounded-lg border border-app bg-app-elevated p-3">
                <Toggle checked={data.showAgentPhoto} onChange={(v) => updateField("showAgentPhoto", v)} label="Show agent photo" />
                <Toggle checked={data.showLogo} onChange={(v) => updateField("showLogo", v)} label="Show company logo" />
              </div>
              {data.showAgentPhoto && (
                <FormField label="Agent Photo">
                  <ImageSlot image={data.agentPhoto} onChange={(img) => updateField("agentPhoto", img)} onRemove={() => updateField("agentPhoto", null)} label="Upload photo" aspect="aspect-square" circular className="max-w-[110px]" />
                </FormField>
              )}
              {data.showLogo && (
                <FormField label="Company Logo">
                  <ImageSlot image={data.logoImage} onChange={(img) => updateField("logoImage", img)} onRemove={() => updateField("logoImage", null)} label="Upload logo" aspect="aspect-[3/1]" className="max-w-[170px]" />
                </FormField>
              )}
            </motion.div>
          )}

          {activePanel === "photos" && (
            <motion.div key="photos" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }} className="space-y-4">
              <FormField label="Main Photo">
                <ImageSlot image={data.propertyImage} onChange={(img) => updateField("propertyImage", img)} onRemove={() => updateField("propertyImage", null)} label="Drop main property photo" />
              </FormField>
              {selectedTemplate === "multi-photo" && (
                <>
                  <FormField label="Second Photo">
                    <ImageSlot image={data.propertyImage2} onChange={(img) => updateField("propertyImage2", img)} onRemove={() => updateField("propertyImage2", null)} label="Upload second" />
                  </FormField>
                  <FormField label="Third Photo">
                    <ImageSlot image={data.propertyImage3} onChange={(img) => updateField("propertyImage3", img)} onRemove={() => updateField("propertyImage3", null)} label="Upload third" />
                  </FormField>
                </>
              )}
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-3">
                <p className="text-[0.7rem] leading-relaxed text-secondary">
                  <span className="font-semibold text-tool-accent">Tip.</span> Drag to reposition, scroll to zoom. Use 1080px+ images for crisp exports.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );

  return (
    <div
      data-tool-theme="agent"
      data-tool="property-poster-creator"
      className="tool-shell flex h-full w-full flex-col overflow-hidden bg-app"
    >
      {/* Template picker — horizontal pill row */}
      <div className="border-b border-app bg-app-elevated px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          {!isNarrow && (
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-faint flex-shrink-0">Template</span>
          )}
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mb-1 flex-1">
            {TEMPLATES.map((t) => {
              const selected = selectedTemplate === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  title={t.description}
                  className={`group flex-shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.7rem] font-medium transition-all border ${selected ? "border-tool-accent bg-tool-accent text-white shadow-card" : "border-app bg-app text-secondary hover:border-tool-accent hover:text-tool-accent"}`}
                >
                  <span className="text-base leading-none">{t.preview}</span>
                  <span className="truncate max-w-[120px]">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workspace — canvas + side panel; orientation flips with width */}
      <div className={`flex flex-1 min-h-0 ${isNarrow ? "flex-col" : "flex-row"}`}>
        {/* === Canvas area === */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Toolbar above canvas */}
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2 flex-shrink-0">
            <div className="flex items-center gap-1">
              <button
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-lg text-faint opacity-50"
                title="Undo (coming soon)"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v1a5 5 0 01-5 5H9m-6-11l4-4m-4 4l4 4" />
                </svg>
              </button>
              <button
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-lg text-faint opacity-50"
                title="Redo (coming soon)"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v1a5 5 0 005 5h4m6-11l-4-4m4 4l-4 4" />
                </svg>
              </button>
              <span className="mx-1 h-4 w-px bg-[var(--border)]" />
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.7rem] text-secondary hover:bg-tool-accent-soft hover:text-tool-accent transition-colors"
                title="Reset property fields"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2 text-[0.65rem] text-muted">
              <span className="hidden sm:inline">{currentFormat === "story" ? "Story Preview" : "Post Preview"}</span>
              <span className="rounded-md bg-app-elevated border border-app px-2 py-0.5 font-mono tabular-nums text-app">{sizeChip}</span>
            </div>
          </div>

          {/* Canvas — keep bespoke poster look (dotted bg, framed preview) */}
          <div className="relative flex-1 min-h-0 bg-[#f3f1ec] dark:bg-[#0b0e11] overflow-auto" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0)", backgroundSize: "22px 22px" }}>
            <div className="flex items-center justify-center min-h-[420px] p-6 lg:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selectedTemplate}-${currentFormat}`}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3, ease }}
                  className="shadow-2xl shadow-black/20 rounded-md overflow-hidden ring-1 ring-black/10"
                  style={{
                    maxWidth: currentFormat === "story" ? "320px" : selectedTemplate === "bold-gradient" ? "440px" : "380px",
                    width: "100%",
                    fontSize: currentFormat === "story" ? "14px" : "15px",
                  }}
                >
                  <PosterTemplate data={data} posterRef={activeRef} format={currentFormat} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Download bar */}
          <div className="border-t border-app bg-app-elevated px-4 py-3 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* Format selector */}
              <div className="flex items-center rounded-lg border border-app bg-app p-0.5">
                {([
                  { id: "jpg" as const, label: "JPG" },
                  { id: "png" as const, label: "PNG" },
                  { id: "story" as const, label: "IG Story" },
                ]).map((f) => {
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
          </div>
        </div>

        {/* === Style / Branding panel === */}
        {sidePanel}
      </div>
    </div>
  );
}
