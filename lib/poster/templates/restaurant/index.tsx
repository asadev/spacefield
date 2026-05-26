/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/restaurant/ — 3 templates for restaurants / F&B
   ═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    dishName: dataStr(d, "dishName"),
    description: dataStr(d, "description"),
    price: dataStr(d, "price"),
    badge: dataStr(d, "badge"),
    dealName: dataStr(d, "dealName"),
    dealItems: dataStr(d, "dealItems"),
    dealPrice: dataStr(d, "dealPrice"),
    validity: dataStr(d, "validity"),
    eventName: dataStr(d, "eventName"),
    eventDate: dataStr(d, "eventDate"),
    eventTime: dataStr(d, "eventTime"),
    location: dataStr(d, "location"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Menu Item Spotlight */
function TemplateDishSpotlight(props: PosterRenderProps) {
  const r = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={r.dishName}
        subtitle={r.badge}
        price={r.price}
        image={r.image1}
        features={r.description}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#1a0f0a]" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={r.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      {r.badge ? (
        <div className="absolute top-[5%] left-[5%] z-10 rounded-full bg-amber-500 px-[1em] py-[0.3em]">
          <span className="text-[0.5em] font-bold tracking-[0.25em] text-[#1a0f0a] uppercase">{r.badge}</span>
        </div>
      ) : null}
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.5em] font-bold leading-[1.1] text-white">{r.dishName}</h2>
        {r.description ? <p className="mt-[0.3em] text-[0.55em] italic text-white/75">{r.description}</p> : null}
        {r.price ? (
          <p className="mt-[0.4em] text-[1.4em] font-extrabold text-amber-400">{props.currency} {r.price}</p>
        ) : null}
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* 2. Combo Deal */
function TemplateComboDeal(props: PosterRenderProps) {
  const r = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={r.dealName}
        subtitle="COMBO DEAL"
        price={r.dealPrice}
        location={r.validity}
        image={r.image1}
        features={r.dealItems}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(160deg, #dc2626 0%, #ea580c 100%)" }}>
      <div className="px-[6%] pt-[6%]">
        <span className="inline-block rounded-full bg-white px-[1em] py-[0.3em] text-[0.5em] font-bold tracking-[0.25em] text-red-700 uppercase">
          Combo Deal
        </span>
      </div>
      <div className="relative mx-[6%] mt-[3%] flex-shrink-0 h-[42%] rounded-2xl overflow-hidden ring-2 ring-white/40">
        <PosterImageBox image={r.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.8em]">
        <div>
          <h2 className="text-[1.4em] font-extrabold leading-[1.1] text-white">{r.dealName}</h2>
          {r.dealItems ? <p className="mt-[0.3em] text-[0.5em] text-white/85">{r.dealItems}</p> : null}
          <div className="mt-[0.5em] inline-block rounded-lg bg-white px-[0.8em] py-[0.4em]">
            <span className="text-[1.2em] font-extrabold text-red-700">{props.currency} {r.dealPrice}</span>
          </div>
          {r.validity ? (
            <p className="mt-[0.3em] text-[0.45em] font-medium text-white/80 uppercase tracking-wider">Valid {r.validity}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

/* 3. Event Night */
function TemplateEventNight(props: PosterRenderProps) {
  const r = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gold"
        title={r.eventName}
        subtitle={r.eventDate}
        location={r.location}
        image={r.image1}
        features={r.eventTime ? `Doors: ${r.eventTime}` : undefined}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0c0c0c]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-[3%] border border-[#c9a96e]/30 pointer-events-none z-20" />
      <div className="relative mx-[6%] mt-[6%] flex-shrink-0 h-[42%] rounded overflow-hidden">
        <PosterImageBox image={r.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] z-10">
        <div className="text-center">
          {r.eventDate ? (
            <span className="text-[0.45em] font-medium tracking-[0.35em] text-[#c9a96e] uppercase">{r.eventDate}</span>
          ) : null}
          <h2 className="mt-[0.3em] text-[1.4em] font-bold leading-[1.1] text-white">{r.eventName}</h2>
          {r.eventTime ? <p className="mt-[0.3em] text-[0.5em] text-white/70">Doors {r.eventTime}</p> : null}
          {r.location ? <p className="text-[0.5em] text-[#c9a96e]/80">{r.location}</p> : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="gold" />
        </div>
      </div>
    </div>
  );
}

export const RESTAURANT_TEMPLATES: PosterTemplate[] = [
  {
    id: "rest-dish-spotlight",
    industry: "restaurant",
    name: "Dish Spotlight",
    description: "Full-bleed food photo with the dish name and price overlaid. Great for daily features.",
    thumbnail: "🍝",
    fields: [
      { key: "dishName", label: "Dish Name", type: "text", required: true, placeholder: "Truffle Mushroom Risotto", group: "Basics" },
      { key: "badge", label: "Badge", type: "text", required: false, placeholder: "Chef's Pick", group: "Basics" },
      { key: "description", label: "Description", type: "text", required: false, placeholder: "Arborio, black truffle, parmesan", group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "85", group: "Basics" },
      { key: "image1", label: "Dish Photo", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      dishName: "Truffle Mushroom Risotto",
      badge: "Chef's Pick",
      description: "Arborio, black truffle, parmesan",
      price: "85",
    },
    dimensions: "both",
    Render: TemplateDishSpotlight,
  },
  {
    id: "rest-combo-deal",
    industry: "restaurant",
    name: "Combo Deal",
    description: "Bold red/orange combo offer — built for delivery aggregator posts.",
    thumbnail: "🍔",
    fields: [
      { key: "dealName", label: "Deal Name", type: "text", required: true, placeholder: "Family Feast — 4 People", group: "Basics" },
      { key: "dealItems", label: "What's Included", type: "text", required: false, placeholder: "2 burgers, fries, 4 drinks, dessert", group: "Basics" },
      { key: "dealPrice", label: "Deal Price", type: "price", required: true, placeholder: "1,499", group: "Basics" },
      { key: "validity", label: "Validity", type: "text", required: false, placeholder: "Mon–Thu only", group: "Basics" },
      { key: "image1", label: "Hero Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      dealName: "Family Feast — 4 People",
      dealItems: "2 burgers · fries · 4 drinks · dessert",
      dealPrice: "1,499",
      validity: "Mon–Thu only",
    },
    dimensions: "both",
    Render: TemplateComboDeal,
  },
  {
    id: "rest-event-night",
    industry: "restaurant",
    name: "Event Night",
    description: "Centered gold-on-dark layout for live music, brunch, or themed nights.",
    thumbnail: "🎷",
    fields: [
      { key: "eventName", label: "Event Name", type: "text", required: true, placeholder: "Jazz Night", group: "Basics" },
      { key: "eventDate", label: "Date", type: "text", required: false, placeholder: "Friday 14 Jun", group: "Basics" },
      { key: "eventTime", label: "Time", type: "text", required: false, placeholder: "8 PM", group: "Basics" },
      { key: "location", label: "Venue Note", type: "text", required: false, placeholder: "Rooftop terrace", group: "Basics" },
      { key: "image1", label: "Hero Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      eventName: "Jazz Night",
      eventDate: "Friday 14 Jun",
      eventTime: "8 PM",
      location: "Rooftop terrace",
    },
    dimensions: "both",
    Render: TemplateEventNight,
  },
];
