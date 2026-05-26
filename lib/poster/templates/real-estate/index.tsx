/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/real-estate/ — original 6 Property Poster templates
   ───────────────────────────────────────────────────────────────────────────
   These are the templates that shipped with the original Property Poster
   Creator. Layouts are preserved verbatim from the pre-refactor
   `app/tools/property-poster-creator/_app.tsx` (lines 376-595). The only
   changes:
     - field reads go through `dataStr`/`dataImage` against PosterData
     - hardcoded "AED" replaced with the workspace `currency` prop
     - branding rows read PosterBranding (`contactName` etc) instead of
       the old PosterData.agentName-shaped union
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import {
  AgentBar,
  LocationPin,
  PosterImageBox,
  StoryShell,
  dataImage,
  dataStr,
} from "../../_shared";

/* ─────────────── Shared field schema (re-used across all 6) ─────────────── */

const RE_STATUS_OPTIONS = [
  "FOR SALE",
  "FOR RENT",
  "JUST LISTED",
  "JUST SOLD",
  "EXCLUSIVE",
  "NEW LAUNCH",
  "OFF PLAN",
  "PRICE REDUCED",
  "OPEN HOUSE",
  "UNDER OFFER",
];

const RE_PROPERTY_TYPES = [
  "Apartment",
  "Villa",
  "Townhouse",
  "Penthouse",
  "Studio",
  "Duplex",
  "Commercial",
  "Land",
  "Office",
];

const RE_FIELDS = [
  { key: "statusLabel", label: "Status Badge", type: "enum" as const, required: false, enumOptions: RE_STATUS_OPTIONS, group: "Listing" },
  { key: "propertyTitle", label: "Title", type: "text" as const, required: true, placeholder: "Stunning Waterfront Residence", group: "Listing" },
  { key: "propertyType", label: "Type", type: "enum" as const, required: false, enumOptions: RE_PROPERTY_TYPES, group: "Listing" },
  { key: "location", label: "Location", type: "text" as const, required: false, placeholder: "Dubai Marina, Dubai", group: "Listing" },
  { key: "price", label: "Price", type: "price" as const, required: true, placeholder: "2,500,000", group: "Listing" },
  { key: "bedrooms", label: "Beds", type: "text" as const, required: false, placeholder: "2", group: "Listing" },
  { key: "bathrooms", label: "Baths", type: "text" as const, required: false, placeholder: "3", group: "Listing" },
  { key: "area", label: "Sqft", type: "text" as const, required: false, placeholder: "1,450", group: "Listing" },
  { key: "features", label: "Highlights", type: "text" as const, required: false, placeholder: "Sea View · Smart Home", group: "Listing" },
  { key: "propertyImage", label: "Main Photo", type: "image" as const, required: false, group: "Photos" },
];

const RE_FIELDS_MULTI = [
  ...RE_FIELDS,
  { key: "propertyImage2", label: "Second Photo", type: "image" as const, required: false, group: "Photos" },
  { key: "propertyImage3", label: "Third Photo", type: "image" as const, required: false, group: "Photos" },
];

const RE_DEFAULT_DATA = {
  statusLabel: "FOR SALE",
  propertyTitle: "Stunning Waterfront Residence",
  propertyType: "Apartment",
  location: "Dubai Marina, Dubai",
  price: "2,500,000",
  bedrooms: "2",
  bathrooms: "3",
  area: "1,450",
  features: "Sea View · High Floor · Smart Home",
};

/* ─────────────── Helpers per template ─────────────── */

function reStats(data: ReturnType<typeof readListing>) {
  const out: { label: string; value: string }[] = [];
  if (data.bedrooms) out.push({ label: "Beds", value: data.bedrooms });
  if (data.bathrooms) out.push({ label: "Baths", value: data.bathrooms });
  if (data.area) out.push({ label: "Sqft", value: data.area });
  return out;
}

function readListing(props: PosterRenderProps) {
  const d = props.data;
  return {
    statusLabel: dataStr(d, "statusLabel"),
    propertyTitle: dataStr(d, "propertyTitle"),
    propertyType: dataStr(d, "propertyType"),
    location: dataStr(d, "location"),
    price: dataStr(d, "price"),
    bedrooms: dataStr(d, "bedrooms"),
    bathrooms: dataStr(d, "bathrooms"),
    area: dataStr(d, "area"),
    features: dataStr(d, "features"),
    propertyImage: dataImage(d, "propertyImage"),
    propertyImage2: dataImage(d, "propertyImage2"),
    propertyImage3: dataImage(d, "propertyImage3"),
  };
}

/* ═══════════════════════════════════════════
   TEMPLATE — Luxury Dark
   ═══════════════════════════════════════════ */

function TemplateLuxuryDark(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-black" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={l.propertyImage} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
      <div className="relative z-10 p-[5%]">
        {l.statusLabel ? (
          <div className="inline-block bg-white px-[1em] py-[0.35em]">
            <span className="text-[0.65em] font-bold tracking-[0.2em] text-black uppercase">{l.statusLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="flex-1" />
      <div className="relative z-10 px-[6%] pb-[6%]">
        {l.features ? <p className="mb-[0.4em] text-[0.5em] tracking-[0.15em] text-white/70 uppercase">{l.features}</p> : null}
        <h2 className="text-[1.4em] font-bold leading-[1.15] tracking-tight text-white">{l.propertyTitle}</h2>
        {l.location ? (
          <div className="mt-[0.3em] flex items-center gap-[0.3em]">
            <LocationPin className="h-[0.6em] w-[0.6em] text-white/60" />
            <span className="text-[0.55em] text-white/70">{l.location}</span>
          </div>
        ) : null}
        {l.price ? <p className="mt-[0.6em] text-[1.6em] font-bold text-white">{props.currency} {l.price}</p> : null}
        <div className="mt-[0.5em] flex gap-[1.2em]">
          {l.bedrooms ? <span className="text-[0.55em] text-white/80">{l.bedrooms} Bed</span> : null}
          {l.bathrooms ? <span className="text-[0.55em] text-white/80">{l.bathrooms} Bath</span> : null}
          {l.area ? <span className="text-[0.55em] text-white/80">{l.area} sqft</span> : null}
        </div>
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE — Modern Light
   ═══════════════════════════════════════════ */

function TemplateModernLight(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="light"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-white" style={{ aspectRatio: "1080/1350" }}>
      {l.statusLabel ? (
        <div className="bg-[#1a1a2e] py-[0.5em] text-center flex-shrink-0">
          <span className="text-[0.5em] font-bold tracking-[0.3em] text-white uppercase">{l.statusLabel}</span>
        </div>
      ) : null}
      <div className="relative flex-shrink-0 h-[50%]">
        <PosterImageBox image={l.propertyImage} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%]">
        <div>
          {l.propertyType ? (
            <span className="inline-block border border-[#1a1a2e] px-[0.6em] py-[0.15em] text-[0.4em] font-semibold tracking-[0.2em] text-[#1a1a2e] uppercase">
              {l.propertyType}
            </span>
          ) : null}
          <h2 className="mt-[0.4em] text-[1.2em] font-bold leading-[1.15] tracking-tight text-[#1a1a2e]">{l.propertyTitle}</h2>
          {l.location ? (
            <div className="mt-[0.2em] flex items-center gap-[0.2em]">
              <LocationPin className="h-[0.5em] w-[0.5em] text-gray-400" />
              <span className="text-[0.5em] text-gray-500">{l.location}</span>
            </div>
          ) : null}
          {l.price ? (
            <div className="mt-[0.5em]">
              <span className="text-[0.4em] text-gray-400 uppercase tracking-wider">Price</span>
              <p className="text-[1.35em] font-bold text-[#1a1a2e]">{props.currency} {l.price}</p>
            </div>
          ) : null}
          <div className="mt-[0.5em] flex gap-[0.5em]">
            {l.bedrooms ? (
              <div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]">
                <span className="text-[0.8em] font-bold text-[#1a1a2e]">{l.bedrooms}</span>
                <span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Beds</span>
              </div>
            ) : null}
            {l.bathrooms ? (
              <div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]">
                <span className="text-[0.8em] font-bold text-[#1a1a2e]">{l.bathrooms}</span>
                <span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Baths</span>
              </div>
            ) : null}
            {l.area ? (
              <div className="flex flex-col items-center rounded bg-gray-50 px-[0.6em] py-[0.35em]">
                <span className="text-[0.8em] font-bold text-[#1a1a2e]">{l.area}</span>
                <span className="text-[0.35em] text-gray-400 uppercase tracking-wider">Sqft</span>
              </div>
            ) : null}
          </div>
          {l.features ? <p className="mt-[0.4em] text-[0.42em] text-gray-400">{l.features}</p> : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="light" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE — Elegant Gold
   ═══════════════════════════════════════════ */

function TemplateElegantGold(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gold"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0c0c0c]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-[3%] border border-[#c9a96e]/40 pointer-events-none z-20" />
      <div className="absolute inset-[4%] border border-[#c9a96e]/20 pointer-events-none z-20" />
      <div className="relative z-10 p-[6%] pb-0">
        {l.statusLabel ? (
          <div className="inline-block bg-[#c9a96e] px-[0.8em] py-[0.3em]">
            <span className="text-[0.5em] font-bold tracking-[0.25em] text-[#0c0c0c] uppercase">{l.statusLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="relative mx-[6%] mt-[0.5em] flex-shrink-0 h-[42%]">
        <PosterImageBox image={l.propertyImage} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.6em] z-10">
        <div>
          <div className="mb-[0.4em] h-px bg-gradient-to-r from-transparent via-[#c9a96e]/60 to-transparent" />
          <h2 className="text-[1.2em] font-bold leading-[1.15] text-white">{l.propertyTitle}</h2>
          {l.location ? (
            <div className="mt-[0.2em] flex items-center gap-[0.3em]">
              <LocationPin className="h-[0.5em] w-[0.5em] text-[#c9a96e]" />
              <span className="text-[0.5em] text-white/60">{l.location}</span>
            </div>
          ) : null}
          {l.price ? (
            <div className="mt-[0.5em]">
              <span className="text-[0.38em] text-[#c9a96e] uppercase tracking-[0.2em]">Starting From</span>
              <p className="text-[1.35em] font-bold text-[#c9a96e]">{props.currency} {l.price}</p>
            </div>
          ) : null}
          <div className="mt-[0.4em] flex gap-[0.4em]">
            {l.bedrooms ? (
              <div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center">
                <span className="text-[0.75em] font-bold text-[#c9a96e]">{l.bedrooms}</span>
                <span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Bedrooms</span>
              </div>
            ) : null}
            {l.bathrooms ? (
              <div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center">
                <span className="text-[0.75em] font-bold text-[#c9a96e]">{l.bathrooms}</span>
                <span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Bathrooms</span>
              </div>
            ) : null}
            {l.area ? (
              <div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.3em] text-center">
                <span className="text-[0.75em] font-bold text-[#c9a96e]">{l.area}</span>
                <span className="block text-[0.3em] text-white/40 uppercase tracking-wider">Sqft</span>
              </div>
            ) : null}
          </div>
          {l.features ? <p className="mt-[0.3em] text-[0.42em] text-white/40">{l.features}</p> : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="gold" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE — Bold Gradient (square)
   ═══════════════════════════════════════════ */

function TemplateBoldGradient(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div
      ref={props.posterRef}
      className="relative flex w-full flex-col overflow-hidden"
      style={{ aspectRatio: "1080/1080", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
    >
      <div className="absolute -top-[20%] -right-[20%] h-[60%] w-[60%] rounded-full bg-white/5" />
      <div className="absolute -bottom-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-white/5" />
      <div className="relative z-10 p-[5%] pb-0">
        {l.statusLabel ? (
          <div className="inline-block bg-white/20 backdrop-blur-sm px-[0.8em] py-[0.3em] rounded-full">
            <span className="text-[0.55em] font-bold tracking-[0.2em] text-white uppercase">{l.statusLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="relative mx-[5%] mt-[0.5em] flex-shrink-0 rounded-2xl overflow-hidden h-[42%]">
        <PosterImageBox image={l.propertyImage} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[5%] pt-[0.5em] z-10">
        <div>
          <h2 className="text-[1.2em] font-extrabold leading-[1.15] text-white">{l.propertyTitle}</h2>
          {l.location ? (
            <div className="mt-[0.2em] flex items-center gap-[0.3em]">
              <LocationPin className="h-[0.5em] w-[0.5em] text-white/70" />
              <span className="text-[0.5em] text-white/80">{l.location}</span>
            </div>
          ) : null}
          {l.price ? (
            <div className="mt-[0.4em] inline-block rounded-lg bg-white/20 backdrop-blur-sm px-[0.6em] py-[0.3em]">
              <span className="text-[1.3em] font-extrabold text-white">{props.currency} {l.price}</span>
            </div>
          ) : null}
          <div className="mt-[0.4em] flex gap-[0.4em]">
            {l.bedrooms ? (
              <div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm">
                <span className="text-[0.75em] font-bold text-white">{l.bedrooms}</span>
                <span className="block text-[0.3em] text-white/60 uppercase">Beds</span>
              </div>
            ) : null}
            {l.bathrooms ? (
              <div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm">
                <span className="text-[0.75em] font-bold text-white">{l.bathrooms}</span>
                <span className="block text-[0.3em] text-white/60 uppercase">Baths</span>
              </div>
            ) : null}
            {l.area ? (
              <div className="rounded-lg bg-white/10 px-[0.6em] py-[0.3em] text-center backdrop-blur-sm">
                <span className="text-[0.75em] font-bold text-white">{l.area}</span>
                <span className="block text-[0.3em] text-white/60 uppercase">Sqft</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-[0.5em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE — Minimal Clean
   ═══════════════════════════════════════════ */

function TemplateMinimalClean(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="light"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-[#f5f5f0]" style={{ aspectRatio: "1080/1350" }}>
      <div className="flex items-center justify-between px-[6%] py-[3%] flex-shrink-0">
        <span className="text-[0.45em] font-medium tracking-[0.25em] text-[#2c2c2c] uppercase">{l.statusLabel}</span>
        {props.branding.showLogo !== false && props.branding.logoImage ? (
          <div className="h-[1.5em] w-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.branding.logoImage.src} alt="" className="h-full w-auto object-contain" />
          </div>
        ) : props.branding.companyName ? (
          <span className="text-[0.4em] font-medium tracking-wider text-[#2c2c2c]/50 uppercase">{props.branding.companyName}</span>
        ) : null}
      </div>
      <div className="relative mx-[5%] flex-shrink-0 h-[44%]">
        <PosterImageBox image={l.propertyImage} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between px-[6%] py-[4%]">
        <div>
          <div className="mb-[0.3em] h-[2px] w-[2em] bg-[#2c2c2c]" />
          <h2 className="text-[1.1em] font-bold leading-[1.15] tracking-tight text-[#2c2c2c]">{l.propertyTitle}</h2>
          {l.location ? <p className="mt-[0.2em] text-[0.45em] text-[#2c2c2c]/50">{l.location}</p> : null}
          {l.price ? <p className="mt-[0.5em] text-[1.3em] font-light text-[#2c2c2c]">{props.currency} {l.price}</p> : null}
          <div className="mt-[0.3em] flex items-center gap-[0.5em] text-[0.45em] text-[#2c2c2c]/60">
            {l.bedrooms ? <span>{l.bedrooms} Bedrooms</span> : null}
            {l.bedrooms && l.bathrooms ? <span className="text-[#2c2c2c]/20">|</span> : null}
            {l.bathrooms ? <span>{l.bathrooms} Bathrooms</span> : null}
            {l.bathrooms && l.area ? <span className="text-[#2c2c2c]/20">|</span> : null}
            {l.area ? <span>{l.area} sqft</span> : null}
          </div>
          {l.features ? <p className="mt-[0.3em] text-[0.38em] text-[#2c2c2c]/40">{l.features}</p> : null}
        </div>
        <div className="mt-[0.5em] flex items-center gap-[0.5em] border-t border-[#2c2c2c]/10 pt-[0.5em]">
          {props.branding.showContactPhoto !== false && props.branding.contactPhoto ? (
            <div className="h-[2em] w-[2em] overflow-hidden rounded-full border border-[#2c2c2c]/10 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={props.branding.contactPhoto.src}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: `${props.branding.contactPhoto.x}% ${props.branding.contactPhoto.y}%` }}
              />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            {props.branding.contactName ? (
              <p className="text-[0.48em] font-medium text-[#2c2c2c] truncate">{props.branding.contactName}</p>
            ) : null}
            <div className="flex items-center gap-[0.3em]">
              {props.branding.contactPhone ? <span className="text-[0.38em] text-[#2c2c2c]/40">{props.branding.contactPhone}</span> : null}
              {props.branding.contactPhone && props.branding.companyName ? (
                <span className="text-[0.25em] text-[#2c2c2c]/20">|</span>
              ) : null}
              {props.branding.companyName ? (
                <span className="text-[0.38em] text-[#2c2c2c]/40 uppercase tracking-wider">{props.branding.companyName}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TEMPLATE — Multi-Photo
   ═══════════════════════════════════════════ */

function TemplateMultiPhoto(props: PosterRenderProps) {
  const l = readListing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={l.propertyTitle}
        subtitle={l.statusLabel}
        price={l.price}
        location={l.location}
        image={l.propertyImage}
        features={l.features}
        stats={reStats(l)}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-[#111]" style={{ aspectRatio: "1080/1350" }}>
      {l.statusLabel ? (
        <div className="bg-white py-[0.45em] text-center flex-shrink-0">
          <span className="text-[0.5em] font-bold tracking-[0.3em] text-black uppercase">{l.statusLabel}</span>
        </div>
      ) : null}
      <div className="relative flex-shrink-0 mx-[3%] h-[46%]">
        <PosterImageBox
          image={l.propertyImage}
          className="absolute top-0 left-0 bottom-0"
          style={{ width: "65%", borderRight: "3px solid #111" }}
        />
        <div className="absolute top-0 right-0 bottom-0" style={{ left: "65%" }}>
          <PosterImageBox
            image={l.propertyImage2}
            className="absolute top-0 left-[3px] right-0"
            style={{ height: "49.5%", borderBottom: "1.5px solid #111" }}
          />
          <PosterImageBox
            image={l.propertyImage3}
            className="absolute bottom-0 left-[3px] right-0"
            style={{ height: "49.5%", borderTop: "1.5px solid #111" }}
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[5%] pt-[0.6em]">
        <div>
          <h2 className="text-[1.1em] font-bold leading-[1.15] text-white">{l.propertyTitle}</h2>
          {l.location ? (
            <div className="mt-[0.2em] flex items-center gap-[0.3em]">
              <LocationPin className="h-[0.5em] w-[0.5em] text-white/50" />
              <span className="text-[0.48em] text-white/60">{l.location}</span>
            </div>
          ) : null}
          {l.price ? <p className="mt-[0.4em] text-[1.35em] font-bold text-white">{props.currency} {l.price}</p> : null}
          <div className="mt-[0.3em] flex gap-[1em] text-[0.45em] text-white/70">
            {l.bedrooms ? <span>{l.bedrooms} Bedrooms</span> : null}
            {l.bathrooms ? <span>{l.bathrooms} Bathrooms</span> : null}
            {l.area ? <span>{l.area} sqft</span> : null}
          </div>
          {l.features ? <p className="mt-[0.3em] text-[0.38em] text-white/40">{l.features}</p> : null}
        </div>
        <div className="mt-[0.5em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Registry export
   ═══════════════════════════════════════════ */

export const REAL_ESTATE_TEMPLATES: PosterTemplate[] = [
  {
    id: "re-luxury-dark",
    industry: "real_estate",
    name: "Luxury Dark",
    description: "Full-bleed hero image with dark overlay. Perfect for luxury villas & penthouses.",
    thumbnail: "🏙️",
    fields: RE_FIELDS,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateLuxuryDark,
  },
  {
    id: "re-modern-light",
    industry: "real_estate",
    name: "Modern Light",
    description: "Clean white layout with bold typography. Great for apartments & townhouses.",
    thumbnail: "🏢",
    fields: RE_FIELDS,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateModernLight,
  },
  {
    id: "re-elegant-gold",
    industry: "real_estate",
    name: "Elegant Gold",
    description: "Gold accents on dark base. Ideal for premium off-plan & new launches.",
    thumbnail: "✨",
    fields: RE_FIELDS,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateElegantGold,
  },
  {
    id: "re-bold-gradient",
    industry: "real_estate",
    name: "Bold Gradient",
    description: "Vibrant gradient frame with strong CTA. Best for social media posts.",
    thumbnail: "🎨",
    fields: RE_FIELDS,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateBoldGradient,
  },
  {
    id: "re-minimal-clean",
    industry: "real_estate",
    name: "Minimal Clean",
    description: "Minimalist design with maximum impact. Works for any property type.",
    thumbnail: "◻️",
    fields: RE_FIELDS,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateMinimalClean,
  },
  {
    id: "re-multi-photo",
    industry: "real_estate",
    name: "Multi-Photo",
    description: "3-photo grid layout. Perfect when you have multiple angles to show.",
    thumbnail: "📸",
    fields: RE_FIELDS_MULTI,
    defaultData: RE_DEFAULT_DATA,
    dimensions: "both",
    Render: TemplateMultiPhoto,
  },
];
