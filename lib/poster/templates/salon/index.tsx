/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/salon/ — 2 templates for salons / beauty studios
   ═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    title: dataStr(d, "title"),
    serviceName: dataStr(d, "serviceName"),
    description: dataStr(d, "description"),
    price: dataStr(d, "price"),
    duration: dataStr(d, "duration"),
    badge: dataStr(d, "badge"),
    openingHours: dataStr(d, "openingHours"),
    note: dataStr(d, "note"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Service Promo */
function TemplateSalonServicePromo(props: PosterRenderProps) {
  const s = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="light"
        title={s.serviceName}
        subtitle={s.badge}
        price={s.price}
        location={s.duration}
        image={s.image1}
        features={s.description}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(170deg, #fdf2f8 0%, #fce7f3 100%)" }}>
      <div className="px-[6%] pt-[6%]">
        {s.badge ? (
          <span className="inline-block rounded-full bg-pink-600 px-[1em] py-[0.3em] text-[0.5em] font-bold tracking-[0.25em] text-white uppercase">
            {s.badge}
          </span>
        ) : null}
      </div>
      <div className="relative mx-[6%] mt-[3%] flex-shrink-0 h-[42%] rounded-2xl overflow-hidden">
        <PosterImageBox image={s.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em]">
        <div>
          <h2 className="text-[1.3em] font-bold leading-[1.1] text-[#5b1d3e]">{s.serviceName}</h2>
          {s.description ? <p className="mt-[0.3em] text-[0.5em] text-[#5b1d3e]/70">{s.description}</p> : null}
          <div className="mt-[0.4em] flex items-baseline gap-[0.6em]">
            {s.price ? (
              <span className="text-[1.3em] font-extrabold text-[#5b1d3e]">{props.currency} {s.price}</span>
            ) : null}
            {s.duration ? (
              <span className="text-[0.5em] text-[#5b1d3e]/60 uppercase tracking-wider">{s.duration}</span>
            ) : null}
          </div>
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="light" />
        </div>
      </div>
    </div>
  );
}

/* 2. Open Hours / Walk-ins Welcome */
function TemplateSalonOpenHours(props: PosterRenderProps) {
  const s = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gold"
        title={s.title}
        subtitle="WALK-INS WELCOME"
        location={s.note}
        image={s.image1}
        features={s.openingHours}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0c0c0c]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-[3%] border border-[#c9a96e]/40 pointer-events-none z-20" />
      <div className="relative z-10 px-[6%] pt-[6%] text-center">
        <span className="text-[0.42em] font-medium tracking-[0.4em] text-[#c9a96e] uppercase">Walk-ins Welcome</span>
        <h1 className="mt-[0.3em] text-[1.4em] font-bold leading-tight text-white">{s.title}</h1>
      </div>
      <div className="relative mx-[8%] mt-[1em] flex-shrink-0 h-[40%] rounded overflow-hidden">
        <PosterImageBox image={s.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] z-10">
        <div className="text-center">
          {s.openingHours ? (
            <p className="text-[0.55em] text-[#c9a96e]/90 whitespace-pre-line">{s.openingHours}</p>
          ) : null}
          {s.note ? <p className="mt-[0.3em] text-[0.45em] italic text-white/60">{s.note}</p> : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="gold" />
        </div>
      </div>
    </div>
  );
}

export const SALON_TEMPLATES: PosterTemplate[] = [
  {
    id: "salon-service-promo",
    industry: "salon",
    name: "Service Promo",
    description: "Soft pink layout for treatments — facials, blowouts, mani-pedis.",
    thumbnail: "💅",
    fields: [
      { key: "serviceName", label: "Service Name", type: "text", required: true, placeholder: "Bridal Hair & Makeup", group: "Basics" },
      { key: "badge", label: "Badge", type: "text", required: false, placeholder: "Signature", group: "Basics" },
      { key: "description", label: "Description", type: "text", required: false, placeholder: "On-site stylist, trial session included", group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "12,000", group: "Basics" },
      { key: "duration", label: "Duration", type: "text", required: false, placeholder: "2 hours", group: "Basics" },
      { key: "image1", label: "Photo", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      serviceName: "Bridal Hair & Makeup",
      badge: "Signature",
      description: "On-site stylist, trial session included",
      price: "12,000",
      duration: "2 hours",
    },
    dimensions: "both",
    Render: TemplateSalonServicePromo,
  },
  {
    id: "salon-open-hours",
    industry: "salon",
    name: "Open Hours",
    description: "Elegant gold-on-dark hours panel — for shopfront / window display + WhatsApp Status.",
    thumbnail: "⏰",
    fields: [
      { key: "title", label: "Salon Name", type: "text", required: true, placeholder: "Studio 27", group: "Basics" },
      { key: "openingHours", label: "Hours", type: "multiline", required: true, placeholder: "Mon–Sat · 10 AM – 9 PM\nSun · 12 – 6 PM", group: "Basics" },
      { key: "note", label: "Note", type: "text", required: false, placeholder: "By appointment only on Sundays", group: "Basics" },
      { key: "image1", label: "Photo", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      title: "Studio 27",
      openingHours: "Mon–Sat · 10 AM – 9 PM\nSun · 12 – 6 PM",
      note: "Walk-ins welcome",
    },
    dimensions: "both",
    Render: TemplateSalonOpenHours,
  },
];
