/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/marketing-agency/ — 3 templates for marketing agencies
   ───────────────────────────────────────────────────────────────────────────
   Service Promo / Case Study / Special Offer. Skewed toward LinkedIn +
   Instagram + WhatsApp Business broadcast.
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    title: dataStr(d, "title"),
    service: dataStr(d, "service"),
    tagline: dataStr(d, "tagline"),
    price: dataStr(d, "price"),
    ctaText: dataStr(d, "ctaText"),
    clientName: dataStr(d, "clientName"),
    metricLabel: dataStr(d, "metricLabel"),
    metricValue: dataStr(d, "metricValue"),
    summary: dataStr(d, "summary"),
    offerName: dataStr(d, "offerName"),
    discount: dataStr(d, "discount"),
    validity: dataStr(d, "validity"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Service Promo */
function TemplateServicePromo(props: PosterRenderProps) {
  const m = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={m.title}
        subtitle={m.service}
        price={m.price}
        location={m.tagline}
        image={m.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}>
      <div className="absolute top-[5%] left-[5%] z-10">
        {m.service ? (
          <span className="inline-block rounded-full bg-white/15 backdrop-blur-sm px-[1em] py-[0.3em] text-[0.5em] font-semibold tracking-[0.25em] text-white uppercase">
            {m.service}
          </span>
        ) : null}
      </div>
      <div className="relative mx-[8%] mt-[20%] flex-shrink-0 h-[35%] rounded-xl overflow-hidden">
        <PosterImageBox image={m.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] z-10">
        <div>
          <h2 className="text-[1.4em] font-extrabold leading-[1.1] text-white">{m.title}</h2>
          {m.tagline ? <p className="mt-[0.3em] text-[0.55em] text-white/80">{m.tagline}</p> : null}
          {m.price ? (
            <p className="mt-[0.4em] text-[1em] font-semibold text-white">{props.currency} {m.price}</p>
          ) : null}
          {m.ctaText ? (
            <div className="mt-[0.6em] inline-block rounded-lg bg-white px-[1em] py-[0.4em]">
              <span className="text-[0.6em] font-bold text-[#4f46e5] uppercase tracking-wider">{m.ctaText}</span>
            </div>
          ) : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

/* 2. Case Study / Result */
function TemplateCaseStudy(props: PosterRenderProps) {
  const m = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={m.title}
        subtitle={m.clientName ? `Client: ${m.clientName}` : "CASE STUDY"}
        location={`${m.metricValue} ${m.metricLabel}`.trim()}
        image={m.image1}
        features={m.summary}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-[#0a0a0a]" style={{ aspectRatio: "1080/1350" }}>
      <div className="px-[6%] pt-[6%] flex-shrink-0">
        <span className="text-[0.45em] font-bold tracking-[0.3em] text-emerald-400 uppercase">Case Study</span>
        {m.clientName ? <p className="mt-[0.2em] text-[0.5em] text-white/60">{m.clientName}</p> : null}
        <h2 className="mt-[0.3em] text-[1.2em] font-bold leading-[1.15] text-white">{m.title}</h2>
      </div>
      <div className="relative mx-[6%] mt-[0.6em] flex-shrink-0 h-[35%] rounded overflow-hidden">
        <PosterImageBox image={m.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.5em]">
        <div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-[1em] py-[0.5em]">
            <p className="text-[1.6em] font-extrabold leading-none text-emerald-400">{m.metricValue}</p>
            {m.metricLabel ? <p className="mt-[0.2em] text-[0.4em] text-emerald-300/80 uppercase tracking-wider">{m.metricLabel}</p> : null}
          </div>
          {m.summary ? <p className="mt-[0.4em] text-[0.45em] leading-relaxed text-white/70">{m.summary}</p> : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* 3. Special Offer */
function TemplateSpecialOffer(props: PosterRenderProps) {
  const m = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={m.offerName}
        subtitle="LIMITED OFFER"
        price={m.discount ? `${m.discount}% off` : m.price}
        location={m.validity}
        image={m.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(135deg, #f97316 0%, #db2777 100%)" }}>
      <div className="absolute top-[5%] right-[5%] z-10 flex h-[3.5em] w-[3.5em] items-center justify-center rounded-full bg-white shadow-2xl rotate-[8deg]">
        {m.discount ? (
          <div className="text-center leading-none">
            <span className="block text-[0.9em] font-extrabold text-pink-600">{m.discount}%</span>
            <span className="block text-[0.35em] font-bold text-pink-600 uppercase">Off</span>
          </div>
        ) : (
          <span className="text-[0.4em] font-bold text-pink-600 uppercase">Offer</span>
        )}
      </div>
      <div className="relative mx-[6%] mt-[12%] flex-shrink-0 h-[42%] rounded-2xl overflow-hidden ring-2 ring-white/30">
        <PosterImageBox image={m.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.8em] z-10">
        <div>
          <h2 className="text-[1.3em] font-extrabold leading-[1.1] text-white">{m.offerName}</h2>
          {m.validity ? (
            <p className="mt-[0.3em] text-[0.5em] font-medium text-white/85 uppercase tracking-wider">Valid {m.validity}</p>
          ) : null}
          {m.price ? <p className="mt-[0.3em] text-[1em] font-bold text-white">{props.currency} {m.price}</p> : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

export const MARKETING_AGENCY_TEMPLATES: PosterTemplate[] = [
  {
    id: "ma-service-promo",
    industry: "marketing_agency",
    name: "Service Promo",
    description: "Bold gradient layout to push a single service — SEO, ads, content, etc.",
    thumbnail: "📣",
    fields: [
      { key: "service", label: "Service Name", type: "text", required: true, placeholder: "Google Ads Management", group: "Basics" },
      { key: "title", label: "Headline", type: "text", required: true, placeholder: "Outrank your competition", group: "Basics" },
      { key: "tagline", label: "Tagline", type: "text", required: false, placeholder: "Setup, launch, optimise — done-for-you", group: "Basics" },
      { key: "price", label: "Starting Price", type: "price", required: false, placeholder: "499/mo", group: "Basics" },
      { key: "ctaText", label: "CTA Button Text", type: "text", required: false, placeholder: "Book a free audit", group: "Basics" },
      { key: "image1", label: "Hero Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      service: "Google Ads Management",
      title: "Outrank Your Competition",
      tagline: "Setup, launch, optimise — done-for-you",
      price: "499/mo",
      ctaText: "Book a free audit",
    },
    dimensions: "both",
    Render: TemplateServicePromo,
  },
  {
    id: "ma-case-study",
    industry: "marketing_agency",
    name: "Case Study",
    description: "Single-metric flex — show a client's result in one number.",
    thumbnail: "📊",
    fields: [
      { key: "clientName", label: "Client Name", type: "text", required: false, placeholder: "Brand Co.", group: "Basics" },
      { key: "title", label: "Headline", type: "text", required: true, placeholder: "3x revenue in 90 days", group: "Basics" },
      { key: "metricValue", label: "Metric Value", type: "text", required: true, placeholder: "+312%", group: "Basics" },
      { key: "metricLabel", label: "Metric Label", type: "text", required: false, placeholder: "Revenue lift", group: "Basics" },
      { key: "summary", label: "Summary", type: "text", required: false, placeholder: "Funnel rebuild + paid social + CRO", group: "Basics" },
      { key: "image1", label: "Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      clientName: "Brand Co.",
      title: "3x Revenue in 90 Days",
      metricValue: "+312%",
      metricLabel: "Revenue lift",
      summary: "Funnel rebuild + paid social + CRO",
    },
    dimensions: "both",
    Render: TemplateCaseStudy,
  },
  {
    id: "ma-special-offer",
    industry: "marketing_agency",
    name: "Special Offer",
    description: "Time-bound offer with rotated discount badge — for end-of-quarter pushes.",
    thumbnail: "🎯",
    fields: [
      { key: "offerName", label: "Offer Name", type: "text", required: true, placeholder: "Year-End Audit Bundle", group: "Basics" },
      { key: "discount", label: "Discount %", type: "number", required: false, placeholder: "30", group: "Basics" },
      { key: "price", label: "Final Price", type: "price", required: false, placeholder: "1,400", group: "Basics" },
      { key: "validity", label: "Validity", type: "text", required: false, placeholder: "until 31 Dec", group: "Basics" },
      { key: "image1", label: "Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      offerName: "Year-End Audit Bundle",
      discount: "30",
      price: "1,400",
      validity: "until 31 Dec",
    },
    dimensions: "both",
    Render: TemplateSpecialOffer,
  },
];
