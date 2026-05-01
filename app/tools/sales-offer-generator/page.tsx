"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AuthGate from "@/components/AuthGate";
import { useUserPreferences } from "@/lib/useUserPreferences";
import ToolRecommendations from "@/components/ToolRecommendations";
import { awardXP } from "@/lib/xp-actions";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface FormData {
  clientName: string;
  propertyName: string;
  developerName: string;
  location: string;
  unitType: string;
  bedrooms: string;
  size: string;
  floor: string;
  price: string;
  paymentPlan: string;
  serviceCharge: string;
  handoverDate: string;
  agentName: string;
  agentPhone: string;
  companyName: string;
}

interface ImageSlot {
  label: string;
  key: string;
  data: string | null;
}

type TemplateId = "classic" | "modern" | "concise";
type OfferStatus = "draft" | "sent" | "accepted";

interface Template {
  id: TemplateId;
  label: string;
  hint: string;
}

const TEMPLATES: Template[] = [
  { id: "classic", label: "Classic", hint: "Full formal layout" },
  { id: "modern", label: "Modern", hint: "Clean, minimal" },
  { id: "concise", label: "Concise", hint: "One-page brief" },
];

const STATUSES: { id: OfferStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
];

function generateRef(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const r = Math.floor(1000 + Math.random() * 9000);
  return `IPP-${y}${m}-${r}`;
}

/* ---------- Image Upload Zone ---------- */
function ImageUploadZone({
  slot,
  onUpload,
  onRemove,
}: {
  slot: ImageSlot;
  onUpload: (key: string, data: string) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onUpload(slot.key, reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [slot.key, onUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) handleFile(file);
    },
    [handleFile],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  if (slot.data) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-app">
        <img
          src={slot.data}
          alt={slot.label}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={() => onRemove(slot.key)}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white text-xs hover:bg-red-500 transition-colors"
        >
          ×
        </button>
        <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[0.55rem] uppercase tracking-[0.15em] text-white text-center">
          {slot.label}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors ${
        dragOver
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app hover:border-tool-accent hover:bg-tool-accent-soft"
      }`}
    >
      <svg
        className="h-6 w-6 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16v-8m0 0l-3 3m3-3l3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"
        />
      </svg>
      <span className="text-[0.55rem] uppercase tracking-[0.15em] text-secondary">
        {slot.label}
      </span>
      <span className="text-[0.5rem] text-muted">Drop or click</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}

/* ---------- Section Card ---------- */
function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated overflow-hidden">
      <div className="flex items-center justify-between bg-tool-accent-soft px-4 py-2.5 border-b border-app">
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-tool-accent">
          {title}
        </h3>
        {hint && (
          <span className="text-[0.55rem] uppercase tracking-[0.1em] text-muted">
            {hint}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function SalesOfferGenerator() {
  const [form, setForm] = useState<FormData>({
    clientName: "",
    propertyName: "",
    developerName: "",
    location: "",
    unitType: "",
    bedrooms: "",
    size: "",
    floor: "",
    price: "",
    paymentPlan: "",
    serviceCharge: "",
    handoverDate: "",
    agentName: "",
    agentPhone: "",
    companyName: "Acme Properties",
  });

  const { prefs, updatePrefs, loading: prefsLoading } = useUserPreferences();
  const prefsApplied = useRef(false);

  useEffect(() => {
    if (!prefsLoading && !prefsApplied.current) {
      prefsApplied.current = true;
      setForm((prev) => ({
        ...prev,
        agentName: prefs.agentName || prev.agentName,
        agentPhone: prefs.agentPhone || prev.agentPhone,
        companyName: prefs.companyName || prev.companyName,
      }));
    }
  }, [prefsLoading, prefs]);

  const [images, setImages] = useState<ImageSlot[]>([
    { label: "Property Photo", key: "propertyPhoto", data: null },
    { label: "Floor Plan", key: "floorPlan", data: null },
    { label: "Master Plan", key: "masterPlan", data: null },
  ]);

  const [template, setTemplate] = useState<TemplateId>("classic");
  const [status, setStatus] = useState<OfferStatus>("draft");
  const [generated, setGenerated] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [genDate, setGenDate] = useState("");
  const [copied, setCopied] = useState(false);
  const xpAwarded = useRef(false);

  const offerRef = useRef<HTMLDivElement>(null);

  const handleImageUpload = useCallback((key: string, data: string) => {
    setImages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, data } : s)),
    );
  }, []);

  const handleImageRemove = useCallback((key: string) => {
    setImages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, data: null } : s)),
    );
  }, []);

  const PREF_FIELDS: (keyof FormData)[] = ["agentName", "agentPhone", "companyName"];

  const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (PREF_FIELDS.includes(key)) {
      updatePrefs({ [key]: value });
    }
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setRefNumber(generateRef());
    setGenDate(
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
    setGenerated(true);
    setCopied(false);
    if (status === "draft") setStatus("sent");
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      awardXP('tool_use', 'tool', 'sales-offer-generator').catch(() => {});
    }
  };

  const annualServiceCharge = useMemo(
    () =>
      form.size && form.serviceCharge
        ? Number(form.size) * Number(form.serviceCharge)
        : null,
    [form.size, form.serviceCharge],
  );

  const offerLines = useMemo(
    () =>
      [
        `${form.companyName || "Acme Properties"}`,
        `EXCLUSIVE PROPERTY OFFER`,
        ``,
        `Date: ${genDate}`,
        `Ref: ${refNumber}`,
        ``,
        `Dear ${form.clientName},`,
        ``,
        `Thank you for your interest. Please find below the details of our exclusive offer.`,
        ``,
        `PROPERTY DETAILS`,
        `Project: ${form.propertyName}`,
        form.developerName ? `Developer: ${form.developerName}` : null,
        form.location ? `Location: ${form.location}` : null,
        `Unit Type: ${form.unitType}`,
        form.bedrooms ? `Bedrooms: ${form.bedrooms}` : null,
        form.size ? `Size: ${Number(form.size).toLocaleString()} sqft` : null,
        form.floor ? `Floor: ${form.floor}` : null,
        ``,
        `FINANCIAL SUMMARY`,
        `Purchase Price: AED ${Number(form.price).toLocaleString()}`,
        `Payment Plan: ${form.paymentPlan}`,
        form.handoverDate ? `Handover: ${form.handoverDate}` : null,
        form.serviceCharge
          ? `Service Charge: AED ${Number(form.serviceCharge).toLocaleString()} / sqft`
          : null,
        annualServiceCharge
          ? `Est. Annual Service Charge: AED ${annualServiceCharge.toLocaleString()}`
          : null,
        ``,
        `This offer is valid for 7 business days from the date above.`,
        ``,
        `Best regards,`,
        form.agentName || "Sales Team",
        form.agentPhone || "",
        form.companyName || "Acme Properties",
        ``,
        `Generate yours at spacefield.co/tools/sales-offer-generator`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    [form, genDate, refNumber, annualServiceCharge],
  );

  const copyText = () => {
    navigator.clipboard.writeText(offerLines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareEmail = () => {
    const subject = `Exclusive Offer: ${form.propertyName || "Property"}`;
    const body = [
      `Dear ${form.clientName},`,
      ``,
      `Thank you for your interest. Please find below the details of our exclusive offer.`,
      ``,
      `PROPERTY DETAILS`,
      `Project: ${form.propertyName}`,
      form.developerName ? `Developer: ${form.developerName}` : null,
      form.location ? `Location: ${form.location}` : null,
      `Unit Type: ${form.unitType}`,
      form.bedrooms ? `Bedrooms: ${form.bedrooms}` : null,
      form.size ? `Size: ${Number(form.size).toLocaleString()} sqft` : null,
      form.floor ? `Floor: ${form.floor}` : null,
      ``,
      `FINANCIAL SUMMARY`,
      `Purchase Price: AED ${Number(form.price).toLocaleString()}`,
      `Payment Plan: ${form.paymentPlan}`,
      form.handoverDate ? `Handover: ${form.handoverDate}` : null,
      ``,
      `This offer is valid for 7 business days.`,
      ``,
      `Best regards,`,
      form.agentName || "Sales Team",
      form.agentPhone || "",
      form.companyName || "Acme Properties",
    ]
      .filter((l) => l !== null)
      .join("\n");
    window.open(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
  };

  const handlePrint = () => window.print();

  const inputCls =
    "w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app outline-none transition-all placeholder:text-muted focus:ring-2 ring-tool-accent focus:border-tool-accent";

  const labelCls =
    "mb-1 block text-[0.65rem] font-medium uppercase tracking-[0.1em] text-secondary";

  const propertyImg = images.find((i) => i.key === "propertyPhoto")?.data;
  const floorPlanImg = images.find((i) => i.key === "floorPlan")?.data;
  const masterPlanImg = images.find((i) => i.key === "masterPlan")?.data;

  const hasClient = form.clientName.trim().length > 0;

  return (
    <AuthGate>
      <div data-tool-theme="agent" data-tool="sales-offer-generator" data-frame="1">
          {/* Print styles */}
          <style jsx global>{`
            @media print {
              body {
                background: white !important;
                color: black !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              nav,
              header,
              .no-print,
              .print-hide {
                display: none !important;
              }
              .print-show {
                display: block !important;
                background: white !important;
                color: black !important;
                border: none !important;
                padding: 0 !important;
                margin: 0 auto !important;
                max-width: 100% !important;
                box-shadow: none !important;
              }
              .print-show * {
                color: black !important;
                border-color: #ddd !important;
              }
              .print-show img {
                max-height: 300px;
                object-fit: contain;
              }
              .print-show .offer-header {
                border-bottom: 2px solid black !important;
              }
            }
          `}</style>

          <main className="min-h-screen bg-app">
            <section className="pb-[clamp(60px,8vw,120px)] pt-6">
              <div className="mx-auto max-w-[1500px] px-4 lg:px-8">
                {/* Header strip */}
                <div className="print-hide mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tool-accent-soft">
                      <svg
                        className="h-5 w-5 text-tool-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="text-base font-semibold text-app">
                          {form.propertyName || "Untitled Property Offer"}
                        </h1>
                        {hasClient && (
                          <span className="inline-flex items-center rounded-full border border-tool-accent/40 bg-tool-accent-soft px-2 py-0.5 text-[0.6rem] font-medium text-tool-accent">
                            {form.clientName}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[0.65rem] text-muted">
                        <span>Sales Offer</span>
                        {refNumber && <span>· {refNumber}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Status pills */}
                  <div className="flex items-center gap-1.5">
                    {STATUSES.map((s) => {
                      const active = status === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStatus(s.id)}
                          className={`rounded-full px-3 py-1 text-[0.6rem] font-medium uppercase tracking-[0.1em] transition ${
                            active
                              ? "bg-tool-accent text-white"
                              : "border border-app bg-app-elevated text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action bar */}
                <div className="print-hide mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[0.65rem] text-secondary">
                    <span className={`h-1.5 w-1.5 rounded-full ${generated ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {generated ? "Offer ready" : "Filling out draft"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyText}
                      disabled={!generated}
                      className="rounded-lg border border-app bg-app px-3 py-1.5 text-[0.65rem] font-medium text-secondary transition hover:bg-tool-accent-soft hover:text-tool-accent disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={shareEmail}
                      disabled={!generated}
                      className="rounded-lg bg-tool-accent px-3 py-1.5 text-[0.65rem] font-medium text-white transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Email
                    </button>
                    <button
                      onClick={handlePrint}
                      disabled={!generated}
                      className="rounded-lg bg-tool-accent px-3 py-1.5 text-[0.65rem] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Print / PDF
                    </button>
                  </div>
                </div>

                {/* Template picker pill row */}
                <div className="print-hide mb-5 flex flex-wrap items-center gap-2">
                  <span className="text-[0.6rem] uppercase tracking-[0.15em] text-muted mr-1">
                    Template
                  </span>
                  {TEMPLATES.map((t) => {
                    const active = template === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplate(t.id)}
                        title={t.hint}
                        className={`rounded-full px-3.5 py-1.5 text-[0.65rem] font-medium transition ${
                          active
                            ? "bg-tool-accent text-white shadow-sm"
                            : "border border-app bg-app-elevated text-secondary hover:bg-tool-accent-soft hover:text-tool-accent"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Two-column body */}
                <div className="grid gap-5 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
                  {/* -------- LEFT: FORM -------- */}
                  <motion.form
                    onSubmit={handleGenerate}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, ease }}
                    className="no-print space-y-4 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1"
                  >
                    <SectionCard title="Attachments" hint="Optional">
                      <div className="grid grid-cols-3 gap-2">
                        {images.map((slot) => (
                          <ImageUploadZone
                            key={slot.key}
                            slot={slot}
                            onUpload={handleImageUpload}
                            onRemove={handleImageRemove}
                          />
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Client">
                      <label className={labelCls}>Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Client full name"
                        value={form.clientName}
                        onChange={set("clientName")}
                        className={inputCls}
                      />
                    </SectionCard>

                    <SectionCard title="Property">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className={labelCls}>Project</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Parkwood"
                            value={form.propertyName}
                            onChange={set("propertyName")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Developer</label>
                          <input
                            type="text"
                            placeholder="e.g. Emaar"
                            value={form.developerName}
                            onChange={set("developerName")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Location</label>
                          <input
                            type="text"
                            placeholder="Community"
                            value={form.location}
                            onChange={set("location")}
                            className={inputCls}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>Unit Type</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 2BR Apartment"
                            value={form.unitType}
                            onChange={set("unitType")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Bedrooms</label>
                          <input
                            type="number"
                            placeholder="2"
                            value={form.bedrooms}
                            onChange={set("bedrooms")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Size (sqft)</label>
                          <input
                            type="number"
                            placeholder="1250"
                            value={form.size}
                            onChange={set("size")}
                            className={inputCls}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>Floor</label>
                          <input
                            type="text"
                            placeholder="e.g. 12"
                            value={form.floor}
                            onChange={set("floor")}
                            className={inputCls}
                          />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Price & Terms">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className={labelCls}>Purchase Price (AED)</label>
                          <input
                            type="number"
                            required
                            placeholder="2500000"
                            value={form.price}
                            onChange={set("price")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Payment Plan</label>
                          <input
                            type="text"
                            required
                            placeholder="60/40"
                            value={form.paymentPlan}
                            onChange={set("paymentPlan")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Handover</label>
                          <input
                            type="text"
                            placeholder="Q4 2026"
                            value={form.handoverDate}
                            onChange={set("handoverDate")}
                            className={inputCls}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>Service Charge (AED/sqft)</label>
                          <input
                            type="number"
                            placeholder="18"
                            value={form.serviceCharge}
                            onChange={set("serviceCharge")}
                            className={inputCls}
                          />
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Agent">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Name</label>
                          <input
                            type="text"
                            placeholder="Your name"
                            value={form.agentName}
                            onChange={set("agentName")}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Phone</label>
                          <input
                            type="text"
                            placeholder="+971"
                            value={form.agentPhone}
                            onChange={set("agentPhone")}
                            className={inputCls}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className={labelCls}>Company</label>
                          <input
                            type="text"
                            placeholder="Company name"
                            value={form.companyName}
                            onChange={set("companyName")}
                            className={inputCls}
                          />
                        </div>
                      </div>
                    </SectionCard>

                    <button
                      type="submit"
                      className="w-full rounded-lg bg-tool-accent px-5 py-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-white shadow-lg shadow-tool-accent/30 transition-all hover:brightness-110 active:scale-[0.99]"
                    >
                      {generated ? "Regenerate Offer" : "Generate Offer"}
                    </button>
                  </motion.form>

                  {/* -------- RIGHT: LIVE PREVIEW -------- */}
                  <div className="no-print rounded-xl border border-app bg-tool-hero p-6 lg:p-10 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                        Live Preview
                      </span>
                      <span className="text-[0.55rem] text-muted">
                        A4 · {TEMPLATES.find((t) => t.id === template)?.label}
                      </span>
                    </div>

                    <AnimatePresence mode="wait">
                      {generated ? (
                        <motion.div
                          key="offer-doc"
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.5, ease }}
                          ref={offerRef}
                          className="print-show mx-auto max-w-[720px] rounded-lg bg-white p-8 sm:p-12 text-neutral-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] ring-1 ring-black/5"
                        >
                          {/* Header */}
                          <div className="offer-header mb-7 flex items-start justify-between border-b-2 border-neutral-900 pb-5">
                            <div>
                              <h2 className="text-xl font-bold tracking-tight text-neutral-900">
                                {form.companyName || "Acme Properties"}
                              </h2>
                              <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.25em] text-tool-accent">
                                Exclusive Property Offer
                              </p>
                            </div>
                            <div className="text-right font-mono text-[0.6rem] text-neutral-500">
                              <div>Date: {genDate}</div>
                              <div>Ref: {refNumber}</div>
                            </div>
                          </div>

                          {/* Greeting */}
                          <p className="mb-6 text-sm leading-relaxed text-neutral-700">
                            Dear <strong className="text-neutral-900">{form.clientName}</strong>,
                            <br />
                            Thank you for your interest. Please find below the details of our exclusive offer for{" "}
                            <strong className="text-neutral-900">{form.propertyName}</strong>.
                          </p>

                          {propertyImg && (
                            <div className="mb-6 overflow-hidden rounded-md ring-1 ring-black/10">
                              <img
                                src={propertyImg}
                                alt="Property"
                                className="w-full max-h-[320px] object-cover"
                              />
                            </div>
                          )}

                          <div className="mb-6">
                            <h3 className="mb-3 border-l-2 border-tool-accent pl-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-neutral-900">
                              Property Details
                            </h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                              <DetailRow label="Project" value={form.propertyName} />
                              {form.developerName && (
                                <DetailRow label="Developer" value={form.developerName} />
                              )}
                              {form.location && (
                                <DetailRow label="Location" value={form.location} />
                              )}
                              <DetailRow label="Unit Type" value={form.unitType} />
                              {form.bedrooms && (
                                <DetailRow label="Bedrooms" value={form.bedrooms} />
                              )}
                              {form.size && (
                                <DetailRow
                                  label="Size"
                                  value={`${Number(form.size).toLocaleString()} sqft`}
                                />
                              )}
                              {form.floor && <DetailRow label="Floor" value={form.floor} />}
                            </div>
                          </div>

                          {(floorPlanImg || masterPlanImg) && (
                            <div className="mb-6 grid grid-cols-2 gap-3">
                              {floorPlanImg && (
                                <div className="overflow-hidden rounded-md ring-1 ring-black/10">
                                  <img
                                    src={floorPlanImg}
                                    alt="Floor Plan"
                                    className="w-full max-h-[200px] object-contain bg-neutral-50"
                                  />
                                  <div className="bg-neutral-50 px-2 py-1 text-center text-[0.55rem] uppercase tracking-[0.2em] text-neutral-500">
                                    Floor Plan
                                  </div>
                                </div>
                              )}
                              {masterPlanImg && (
                                <div className="overflow-hidden rounded-md ring-1 ring-black/10">
                                  <img
                                    src={masterPlanImg}
                                    alt="Master Plan"
                                    className="w-full max-h-[200px] object-contain bg-neutral-50"
                                  />
                                  <div className="bg-neutral-50 px-2 py-1 text-center text-[0.55rem] uppercase tracking-[0.2em] text-neutral-500">
                                    Master Plan
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mb-6">
                            <h3 className="mb-3 border-l-2 border-tool-accent pl-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-neutral-900">
                              Financial Summary
                            </h3>
                            <div className="divide-y divide-neutral-200 rounded-md ring-1 ring-neutral-200">
                              <FinanceRow label="Purchase Price" value={`AED ${Number(form.price).toLocaleString()}`} bold />
                              <FinanceRow label="Payment Plan" value={form.paymentPlan} />
                              {form.handoverDate && (
                                <FinanceRow label="Handover" value={form.handoverDate} />
                              )}
                              {form.serviceCharge && (
                                <FinanceRow
                                  label="Service Charge"
                                  value={`AED ${Number(form.serviceCharge).toLocaleString()} / sqft`}
                                />
                              )}
                              {annualServiceCharge && (
                                <FinanceRow
                                  label="Est. Annual Service"
                                  value={`AED ${annualServiceCharge.toLocaleString()}`}
                                  highlight
                                />
                              )}
                            </div>
                          </div>

                          <div className="mb-8 rounded-md bg-tool-accent-soft p-3 text-xs leading-relaxed text-neutral-700 ring-1 ring-tool-accent/30">
                            This offer is valid for <strong>7 business days</strong> from the date
                            above. To proceed, please confirm your interest and we will initiate
                            the booking process.
                          </div>

                          {/* Signature */}
                          <div className="border-t border-neutral-300 pt-5">
                            <p className="text-sm text-neutral-600">Best regards,</p>
                            <div className="mt-6 mb-1 h-px w-48 bg-neutral-400" />
                            <p className="text-sm font-semibold text-neutral-900">
                              {form.agentName || "Sales Team"}
                            </p>
                            {form.agentPhone && (
                              <p className="font-mono text-xs text-neutral-600">{form.agentPhone}</p>
                            )}
                            <p className="text-xs text-neutral-500">
                              {form.companyName || "Acme Properties"}
                            </p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="doc-placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mx-auto max-w-[720px] rounded-lg bg-white p-12 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
                        >
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tool-accent-soft">
                              <svg
                                className="h-6 w-6 text-tool-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </div>
                            <p className="text-sm font-medium text-neutral-700">
                              Your offer will appear here
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              Fill the form on the left and click Generate
                            </p>
                            <div className="mt-8 w-full space-y-2 opacity-40">
                              <div className="h-2 rounded bg-neutral-200" />
                              <div className="h-2 w-5/6 rounded bg-neutral-200" />
                              <div className="h-2 w-4/6 rounded bg-neutral-200" />
                              <div className="mt-6 h-28 rounded bg-neutral-100" />
                              <div className="h-2 w-3/6 rounded bg-neutral-200" />
                              <div className="h-2 w-5/6 rounded bg-neutral-200" />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="mt-10">
                  <ToolRecommendations slug="sales-offer-generator" />
                </div>
              </div>
            </section>
          </main>
        </div>
    </AuthGate>
  );
}

/* ---------- Detail Row ---------- */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.6rem] uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className="font-mono text-sm text-neutral-900">{value}</span>
    </div>
  );
}

/* ---------- Finance Row ---------- */
function FinanceRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-tool-accent-soft" : ""
      }`}
    >
      <span className="text-xs text-neutral-600">{label}</span>
      <span
        className={`font-mono text-sm ${bold ? "font-bold" : ""} text-neutral-900`}
      >
        {value}
      </span>
    </div>
  );
}
