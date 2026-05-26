/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/generic/ — 3 fallback templates for any industry
   ───────────────────────────────────────────────────────────────────────────
   The "Generic" industry shows up when:
     1. workspace.industry is null or unknown
     2. user manually overrides the dropdown to "Generic"
   These templates are intentionally minimal — title, description, optional
   price + image, plus standard branding. They get out of the way.
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    title: dataStr(d, "title"),
    subtitle: dataStr(d, "subtitle"),
    description: dataStr(d, "description"),
    price: dataStr(d, "price"),
    badge: dataStr(d, "badge"),
    ctaText: dataStr(d, "ctaText"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Announcement */
function TemplateAnnouncement(props: PosterRenderProps) {
  const g = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={g.title}
        subtitle={g.badge}
        price={g.price}
        location={g.subtitle}
        image={g.image1}
        features={g.description}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-black" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={g.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      <div className="absolute top-[5%] left-[5%] z-10">
        {g.badge ? (
          <span className="inline-block bg-white px-[1em] py-[0.35em] text-[0.6em] font-bold tracking-[0.2em] text-black uppercase">
            {g.badge}
          </span>
        ) : null}
      </div>
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.4em] font-bold leading-[1.1] text-white">{g.title}</h2>
        {g.subtitle ? <p className="mt-[0.3em] text-[0.55em] uppercase tracking-[0.15em] text-white/70">{g.subtitle}</p> : null}
        {g.description ? <p className="mt-[0.3em] text-[0.5em] text-white/75">{g.description}</p> : null}
        {g.price ? <p className="mt-[0.4em] text-[1.4em] font-bold text-white">{props.currency} {g.price}</p> : null}
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* 2. Sale / Offer */
function TemplateSale(props: PosterRenderProps) {
  const g = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={g.title}
        subtitle={g.badge || "OFFER"}
        price={g.price}
        location={g.subtitle}
        image={g.image1}
        features={g.description}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1080", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <div className="absolute top-[5%] right-[5%] z-10">
        {g.badge ? (
          <span className="inline-block rounded-full bg-white/20 backdrop-blur-sm px-[1em] py-[0.3em] text-[0.55em] font-bold tracking-[0.2em] text-white uppercase">
            {g.badge}
          </span>
        ) : null}
      </div>
      <div className="relative mx-[6%] mt-[15%] flex-shrink-0 h-[42%] rounded-2xl overflow-hidden">
        <PosterImageBox image={g.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em] z-10">
        <div>
          <h2 className="text-[1.2em] font-extrabold leading-[1.1] text-white">{g.title}</h2>
          {g.description ? <p className="mt-[0.2em] text-[0.5em] text-white/85">{g.description}</p> : null}
          {g.price ? (
            <p className="mt-[0.4em] text-[1.3em] font-extrabold text-white">{props.currency} {g.price}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

/* 3. Custom / Minimal */
function TemplateCustom(props: PosterRenderProps) {
  const g = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="light"
        title={g.title}
        subtitle={g.subtitle}
        price={g.price}
        image={g.image1}
        features={g.description}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-[#f5f5f0]" style={{ aspectRatio: "1080/1350" }}>
      <div className="relative mx-[5%] mt-[5%] flex-shrink-0 h-[44%]">
        <PosterImageBox image={g.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between px-[6%] py-[5%]">
        <div>
          <div className="mb-[0.3em] h-[2px] w-[2em] bg-[#2c2c2c]" />
          {g.subtitle ? (
            <p className="text-[0.45em] font-medium tracking-[0.25em] text-[#2c2c2c]/50 uppercase">{g.subtitle}</p>
          ) : null}
          <h2 className="mt-[0.2em] text-[1.2em] font-bold leading-[1.15] tracking-tight text-[#2c2c2c]">{g.title}</h2>
          {g.description ? <p className="mt-[0.3em] text-[0.5em] text-[#2c2c2c]/60">{g.description}</p> : null}
          {g.price ? <p className="mt-[0.4em] text-[1.3em] font-light text-[#2c2c2c]">{props.currency} {g.price}</p> : null}
          {g.ctaText ? (
            <p className="mt-[0.4em] text-[0.5em] font-medium uppercase tracking-wider text-[#2c2c2c]/80">{g.ctaText}</p>
          ) : null}
        </div>
        <div className="mt-[0.5em]">
          <AgentBar branding={props.branding} theme="light" />
        </div>
      </div>
    </div>
  );
}

const GENERIC_FIELDS: PosterTemplate["fields"] = [
  { key: "title", label: "Title", type: "text", required: true, placeholder: "Title goes here", group: "Basics" },
  { key: "subtitle", label: "Subtitle", type: "text", required: false, placeholder: "Short context line", group: "Basics" },
  { key: "badge", label: "Badge", type: "text", required: false, placeholder: "NEW", group: "Basics" },
  { key: "description", label: "Description", type: "text", required: false, placeholder: "One-line description", group: "Basics" },
  { key: "price", label: "Price", type: "price", required: false, placeholder: "1,200", group: "Basics" },
  { key: "ctaText", label: "CTA Text", type: "text", required: false, placeholder: "Order now", group: "Basics" },
  { key: "image1", label: "Image", type: "image", required: false, group: "Photos" },
];

export const GENERIC_TEMPLATES: PosterTemplate[] = [
  {
    id: "generic-announcement",
    industry: "generic",
    name: "Announcement",
    description: "Full-bleed photo with title + badge — works for any product or launch.",
    thumbnail: "📢",
    fields: GENERIC_FIELDS,
    defaultData: {
      title: "Big Announcement",
      subtitle: "Save the date",
      badge: "NEW",
      description: "A short, sharp one-liner that says what changed.",
    },
    dimensions: "both",
    Render: TemplateAnnouncement,
  },
  {
    id: "generic-sale",
    industry: "generic",
    name: "Sale / Offer",
    description: "Square gradient layout perfect for IG / Facebook offers.",
    thumbnail: "🏷️",
    fields: GENERIC_FIELDS,
    defaultData: {
      title: "Limited Offer",
      badge: "SALE",
      description: "Up to 30% off, this week only.",
      price: "499",
    },
    dimensions: "both",
    Render: TemplateSale,
  },
  {
    id: "generic-custom",
    industry: "generic",
    name: "Custom Minimal",
    description: "Soft minimal layout — fill in whatever fields you need.",
    thumbnail: "◻️",
    fields: GENERIC_FIELDS,
    defaultData: {
      title: "Your Title Here",
      subtitle: "Project name",
      description: "Customise every field to match your brand.",
    },
    dimensions: "both",
    Render: TemplateCustom,
  },
];
