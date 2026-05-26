/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/automotive/ — 2 templates for car dealers / workshops
   ═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    make: dataStr(d, "make"),
    model: dataStr(d, "model"),
    year: dataStr(d, "year"),
    mileage: dataStr(d, "mileage"),
    price: dataStr(d, "price"),
    condition: dataStr(d, "condition"),
    serviceName: dataStr(d, "serviceName"),
    serviceTagline: dataStr(d, "serviceTagline"),
    servicePrice: dataStr(d, "servicePrice"),
    bookingNote: dataStr(d, "bookingNote"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Car For Sale */
function TemplateCarForSale(props: PosterRenderProps) {
  const a = read(props);
  const title = `${a.year} ${a.make} ${a.model}`.trim();
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={title}
        subtitle={a.condition || "FOR SALE"}
        price={a.price}
        location={a.mileage ? `${a.mileage} km` : undefined}
        image={a.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-black" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={a.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />
      <div className="absolute top-[5%] left-[5%] z-10">
        <span className="inline-block bg-white px-[1em] py-[0.35em] text-[0.6em] font-bold tracking-[0.25em] text-black uppercase">
          {a.condition || "For Sale"}
        </span>
      </div>
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.6em] font-extrabold leading-[1.05] text-white">{title}</h2>
        <div className="mt-[0.4em] flex items-center gap-[1em] text-[0.55em] text-white/80">
          {a.year ? <span>{a.year}</span> : null}
          {a.mileage ? <span>{a.mileage} km</span> : null}
        </div>
        {a.price ? (
          <p className="mt-[0.4em] text-[1.6em] font-extrabold text-amber-400">{props.currency} {a.price}</p>
        ) : null}
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* 2. Service Special */
function TemplateAutoService(props: PosterRenderProps) {
  const a = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={a.serviceName}
        subtitle="SERVICE SPECIAL"
        price={a.servicePrice}
        location={a.bookingNote}
        image={a.image1}
        features={a.serviceTagline}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)" }}>
      <div className="px-[6%] pt-[6%]">
        <span className="inline-block rounded bg-yellow-400 px-[1em] py-[0.3em] text-[0.5em] font-extrabold tracking-[0.25em] text-blue-900 uppercase">
          Service Special
        </span>
      </div>
      <div className="relative mx-[6%] mt-[3%] flex-shrink-0 h-[40%] rounded-2xl overflow-hidden ring-2 ring-white/30">
        <PosterImageBox image={a.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em]">
        <div>
          <h2 className="text-[1.4em] font-extrabold leading-[1.1] text-white">{a.serviceName}</h2>
          {a.serviceTagline ? (
            <p className="mt-[0.3em] text-[0.55em] text-white/80">{a.serviceTagline}</p>
          ) : null}
          {a.servicePrice ? (
            <p className="mt-[0.4em] text-[1.3em] font-extrabold text-yellow-300">{props.currency} {a.servicePrice}</p>
          ) : null}
          {a.bookingNote ? (
            <p className="mt-[0.3em] text-[0.5em] text-white/80">{a.bookingNote}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

export const AUTOMOTIVE_TEMPLATES: PosterTemplate[] = [
  {
    id: "auto-car-for-sale",
    industry: "automotive",
    name: "Car For Sale",
    description: "Listing-style layout for dealers — full-bleed photo, year/make/model, price.",
    thumbnail: "🚗",
    fields: [
      { key: "year", label: "Year", type: "text", required: false, placeholder: "2022", group: "Basics" },
      { key: "make", label: "Make", type: "text", required: true, placeholder: "Toyota", group: "Basics" },
      { key: "model", label: "Model", type: "text", required: true, placeholder: "Corolla 1.8 SE", group: "Basics" },
      { key: "mileage", label: "Mileage (km)", type: "text", required: false, placeholder: "42,000", group: "Basics" },
      { key: "condition", label: "Badge", type: "text", required: false, placeholder: "Certified Pre-Owned", group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "3,250,000", group: "Basics" },
      { key: "image1", label: "Car Photo", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      year: "2022",
      make: "Toyota",
      model: "Corolla 1.8 SE",
      mileage: "42,000",
      condition: "Certified Pre-Owned",
      price: "3,250,000",
    },
    dimensions: "both",
    Render: TemplateCarForSale,
  },
  {
    id: "auto-service-special",
    industry: "automotive",
    name: "Service Special",
    description: "Workshop service promo — oil change, AC service, detailing, tyre swap.",
    thumbnail: "🔧",
    fields: [
      { key: "serviceName", label: "Service Name", type: "text", required: true, placeholder: "Full AC Service", group: "Basics" },
      { key: "serviceTagline", label: "Tagline", type: "text", required: false, placeholder: "Beat the summer heat", group: "Basics" },
      { key: "servicePrice", label: "Price", type: "price", required: true, placeholder: "8,500", group: "Basics" },
      { key: "bookingNote", label: "Booking Note", type: "text", required: false, placeholder: "Call 0312-XXXXXXX to book", group: "Basics" },
      { key: "image1", label: "Photo", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      serviceName: "Full AC Service",
      serviceTagline: "Beat the summer heat",
      servicePrice: "8,500",
      bookingNote: "Call to book your slot",
    },
    dimensions: "both",
    Render: TemplateAutoService,
  },
];
