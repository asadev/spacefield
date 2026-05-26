/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/clothing-retail/ — 6 templates for clothing shops
   ───────────────────────────────────────────────────────────────────────────
   Designed for Pakistani unstitched-fabric shops, but generic enough to
   serve any clothing/retail brand. Templates lean on lifestyle imagery
   with crisp pricing badges — built for WhatsApp Status + Instagram +
   Facebook drops, the channels Pakistani shops actually convert on.

   Currency: defaults to PKR in defaultData, but the rendered currency
   reads from props.currency so a UAE/INR/USD shop sees the right symbol.
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

/* ───────────── Shared enums + helpers ───────────── */

const FABRIC_TYPES = ["Lawn", "Cambric", "Linen", "Khaddar", "Silk", "Cotton", "Chiffon", "Other"];
const SEASONS = ["Eid Collection", "Wedding Season", "Winter", "Spring", "Summer", "Autumn", "Year-Round"];
const PIECE_OPTIONS = ["1-piece", "2-piece", "3-piece"];

function readClothing(props: PosterRenderProps) {
  const d = props.data;
  return {
    title: dataStr(d, "title"),
    fabricType: dataStr(d, "fabricType"),
    price: dataStr(d, "price"),
    originalPrice: dataStr(d, "originalPrice"),
    salePrice: dataStr(d, "salePrice"),
    discountPct: dataStr(d, "discountPct"),
    sizes: dataStr(d, "sizes"),
    piecesCount: dataStr(d, "piecesCount"),
    collectionName: dataStr(d, "collectionName"),
    season: dataStr(d, "season"),
    tagline: dataStr(d, "tagline"),
    priceRange: dataStr(d, "priceRange"),
    piecesLeft: dataStr(d, "piecesLeft"),
    urgencyText: dataStr(d, "urgencyText"),
    itemsCount: dataStr(d, "itemsCount"),
    fromPrice: dataStr(d, "fromPrice"),
    minQty: dataStr(d, "minQty"),
    bulkDiscount: dataStr(d, "bulkDiscount"),
    contactInfo: dataStr(d, "contactInfo"),
    image1: dataImage(d, "image1"),
    image2: dataImage(d, "image2"),
    image3: dataImage(d, "image3"),
  };
}

/* ═══════════════════════════════════════════
   1. NEW ARRIVAL
   ═══════════════════════════════════════════ */

function TemplateNewArrival(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={c.title}
        subtitle="NEW ARRIVAL"
        price={c.price}
        location={c.fabricType}
        image={c.image1}
        features={[c.piecesCount, c.sizes].filter(Boolean).join(" · ")}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div
      ref={props.posterRef}
      className="relative flex w-full flex-col overflow-hidden"
      style={{ aspectRatio: "1080/1350", background: "linear-gradient(160deg, #fef3c7 0%, #fbcfe8 100%)" }}
    >
      <div className="absolute top-[3%] right-[3%] z-10 inline-block rounded-full bg-rose-600 px-[1em] py-[0.35em]">
        <span className="text-[0.55em] font-bold tracking-[0.2em] text-white uppercase">New Arrival</span>
      </div>
      <div className="relative flex-shrink-0 h-[58%] mx-[5%] mt-[8%] rounded-2xl overflow-hidden ring-1 ring-black/5">
        <PosterImageBox image={c.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em] z-10">
        <div>
          {c.fabricType ? (
            <span className="text-[0.45em] font-medium tracking-[0.2em] text-rose-700 uppercase">{c.fabricType}</span>
          ) : null}
          <h2 className="mt-[0.2em] text-[1.2em] font-bold leading-[1.15] text-[#3b1240]">{c.title}</h2>
          <div className="mt-[0.4em] flex items-baseline gap-[0.5em]">
            {c.price ? (
              <span className="text-[1.3em] font-extrabold text-[#3b1240]">{props.currency} {c.price}</span>
            ) : null}
            {c.piecesCount ? (
              <span className="text-[0.5em] text-[#3b1240]/60 uppercase tracking-wider">{c.piecesCount}</span>
            ) : null}
          </div>
          {c.sizes ? (
            <p className="mt-[0.2em] text-[0.45em] text-[#3b1240]/60">Sizes: {c.sizes}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="light" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   2. SALE DROP
   ═══════════════════════════════════════════ */

function TemplateSaleDrop(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={c.title}
        subtitle={c.discountPct ? `${c.discountPct}% OFF` : "SALE"}
        price={c.salePrice || c.price}
        location={c.sizes}
        image={c.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0a0a0a]" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={c.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
      {c.discountPct ? (
        <div className="absolute top-[4%] right-[4%] z-10 flex h-[3.5em] w-[3.5em] items-center justify-center rounded-full bg-red-600 shadow-2xl rotate-[-12deg]">
          <div className="text-center leading-none">
            <span className="block text-[0.9em] font-extrabold text-white">{c.discountPct}%</span>
            <span className="block text-[0.35em] font-bold text-white/90 uppercase tracking-wider">Off</span>
          </div>
        </div>
      ) : null}
      <div className="absolute top-[5%] left-[5%] z-10">
        <span className="inline-block rounded bg-white px-[0.8em] py-[0.3em] text-[0.6em] font-extrabold tracking-[0.25em] text-black uppercase">
          Sale
        </span>
      </div>
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.3em] font-bold leading-[1.15] text-white">{c.title}</h2>
        {c.sizes ? <p className="mt-[0.2em] text-[0.5em] text-white/70">Sizes: {c.sizes}</p> : null}
        <div className="mt-[0.5em] flex items-baseline gap-[0.6em]">
          {c.salePrice ? (
            <span className="text-[1.6em] font-extrabold text-red-400">{props.currency} {c.salePrice}</span>
          ) : null}
          {c.originalPrice ? (
            <span className="text-[0.6em] font-medium text-white/40 line-through">
              {props.currency} {c.originalPrice}
            </span>
          ) : null}
        </div>
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   3. SEASONAL COLLECTION
   ═══════════════════════════════════════════ */

function TemplateSeasonalCollection(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gold"
        title={c.collectionName || c.title}
        subtitle={c.season}
        price={c.priceRange}
        location={c.tagline}
        image={c.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#0c0c0c]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-[3%] border border-[#c9a96e]/30 pointer-events-none z-20" />
      <div className="relative z-10 px-[6%] pt-[6%] text-center">
        {c.season ? (
          <span className="inline-block text-[0.42em] font-medium tracking-[0.4em] text-[#c9a96e] uppercase">
            {c.season}
          </span>
        ) : null}
        <h1 className="mt-[0.3em] text-[1.4em] font-bold leading-tight text-white">{c.collectionName || c.title}</h1>
      </div>
      <div className="relative mx-[8%] mt-[0.6em] flex-shrink-0 h-[48%]">
        <PosterImageBox image={c.image1} className="absolute inset-0" />
        {c.image2 ? (
          <div className="absolute bottom-[-3%] right-[-6%] h-[40%] w-[35%] rounded ring-2 ring-[#0c0c0c]">
            <PosterImageBox image={c.image2} className="absolute inset-0" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em] z-10">
        <div className="text-center">
          {c.tagline ? <p className="text-[0.55em] italic text-white/70">{c.tagline}</p> : null}
          {c.priceRange ? (
            <p className="mt-[0.4em] text-[1em] font-semibold text-[#c9a96e]">{c.priceRange}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="gold" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   4. LAST PIECES / ALMOST SOLD OUT
   ═══════════════════════════════════════════ */

function TemplateLastPieces(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={c.title}
        subtitle={c.piecesLeft ? `Only ${c.piecesLeft} left` : "ALMOST SOLD OUT"}
        price={c.price}
        location={c.urgencyText}
        image={c.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#1a0f0f]" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={c.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute top-[4%] left-[4%] z-10 inline-block rounded-md bg-amber-500 px-[1em] py-[0.4em] shadow-2xl animate-pulse">
        <span className="text-[0.55em] font-extrabold tracking-[0.2em] text-black uppercase">
          {c.piecesLeft ? `Only ${c.piecesLeft} Left` : "Almost Gone"}
        </span>
      </div>
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.3em] font-bold leading-[1.15] text-white">{c.title}</h2>
        {c.urgencyText ? (
          <p className="mt-[0.3em] text-[0.55em] italic text-amber-300/90">{c.urgencyText}</p>
        ) : null}
        {c.price ? (
          <p className="mt-[0.4em] text-[1.5em] font-extrabold text-white">{props.currency} {c.price}</p>
        ) : null}
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   5. STOCK REFRESH
   ═══════════════════════════════════════════ */

function TemplateStockRefresh(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="light"
        title={c.title}
        subtitle={c.itemsCount ? `${c.itemsCount} new pieces` : "STOCK REFRESH"}
        price={c.fromPrice}
        image={c.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden bg-white" style={{ aspectRatio: "1080/1350" }}>
      <div className="bg-emerald-600 py-[0.5em] text-center flex-shrink-0">
        <span className="text-[0.5em] font-bold tracking-[0.3em] text-white uppercase">Stock Refreshed</span>
      </div>
      <div className="relative flex-shrink-0 mx-[3%] mt-[3%] h-[40%]">
        <PosterImageBox
          image={c.image1}
          className="absolute top-0 left-0 bottom-0"
          style={{ width: "65%", borderRight: "3px solid white" }}
        />
        <div className="absolute top-0 right-0 bottom-0" style={{ left: "65%" }}>
          <PosterImageBox
            image={c.image2}
            className="absolute top-0 left-[3px] right-0"
            style={{ height: "49.5%", borderBottom: "1.5px solid white" }}
          />
          <PosterImageBox
            image={c.image3}
            className="absolute bottom-0 left-[3px] right-0"
            style={{ height: "49.5%", borderTop: "1.5px solid white" }}
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em]">
        <div>
          <h2 className="text-[1.1em] font-bold leading-[1.15] text-[#1a1a2e]">{c.title}</h2>
          <div className="mt-[0.4em] flex items-baseline gap-[0.4em]">
            {c.itemsCount ? (
              <span className="text-[0.85em] font-bold text-emerald-700">{c.itemsCount} items</span>
            ) : null}
            {c.itemsCount && c.fromPrice ? (
              <span className="text-[0.4em] text-gray-400">·</span>
            ) : null}
            {c.fromPrice ? (
              <span className="text-[0.7em] font-semibold text-[#1a1a2e]">
                from {props.currency} {c.fromPrice}
              </span>
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

/* ═══════════════════════════════════════════
   6. BULK WEDDING ORDER
   ═══════════════════════════════════════════ */

function TemplateBulkOrder(props: PosterRenderProps) {
  const c = readClothing(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gold"
        title={c.title}
        subtitle="BULK / WEDDING"
        price={c.bulkDiscount ? `${c.bulkDiscount}% off` : undefined}
        location={c.contactInfo}
        image={c.image1}
        features={c.minQty ? `Min order: ${c.minQty}` : undefined}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-[#1a0e1f]" style={{ aspectRatio: "1080/1350" }}>
      <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 70% 20%, rgba(201,169,110,0.3), transparent 60%)" }} />
      <div className="relative z-10 p-[6%] pb-0">
        <span className="inline-block rounded-full border border-[#c9a96e]/60 px-[1em] py-[0.3em] text-[0.5em] font-semibold tracking-[0.3em] text-[#c9a96e] uppercase">
          Bulk / Wedding
        </span>
      </div>
      <div className="relative mx-[5%] mt-[0.5em] flex-shrink-0 h-[40%] rounded overflow-hidden ring-1 ring-[#c9a96e]/30">
        <PosterImageBox image={c.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[0.6em] z-10">
        <div>
          <h2 className="text-[1.2em] font-bold leading-[1.15] text-white">{c.title}</h2>
          <div className="mt-[0.4em] grid grid-cols-2 gap-[0.4em]">
            {c.minQty ? (
              <div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.4em] rounded">
                <span className="block text-[0.3em] text-white/50 uppercase tracking-wider">Min Order</span>
                <span className="text-[0.7em] font-bold text-[#c9a96e]">{c.minQty}</span>
              </div>
            ) : null}
            {c.bulkDiscount ? (
              <div className="border border-[#c9a96e]/30 px-[0.6em] py-[0.4em] rounded">
                <span className="block text-[0.3em] text-white/50 uppercase tracking-wider">Bulk Discount</span>
                <span className="text-[0.7em] font-bold text-[#c9a96e]">{c.bulkDiscount}% off</span>
              </div>
            ) : null}
          </div>
          {c.contactInfo ? (
            <p className="mt-[0.4em] text-[0.5em] text-white/70">{c.contactInfo}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em]">
          <AgentBar branding={props.branding} theme="gold" />
        </div>
      </div>
    </div>
  );
}

/* ───────────── Registry ───────────── */

const COMMON_PHOTO_FIELDS = (extra = 0) => {
  const out: PosterTemplate["fields"] = [
    { key: "image1", label: "Main Photo", type: "image", required: false, group: "Photos" },
  ];
  if (extra >= 1) out.push({ key: "image2", label: "Second Photo", type: "image", required: false, group: "Photos" });
  if (extra >= 2) out.push({ key: "image3", label: "Third Photo", type: "image", required: false, group: "Photos" });
  return out;
};

export const CLOTHING_RETAIL_TEMPLATES: PosterTemplate[] = [
  {
    id: "clothing-new-arrival",
    industry: "clothing_retail",
    name: "New Arrival",
    description: "Soft pastel hero with a single statement piece — built for unstitched lawn / cambric drops.",
    thumbnail: "👗",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Embroidered Lawn 3-Piece", group: "Basics" },
      { key: "fabricType", label: "Fabric", type: "enum", required: false, enumOptions: FABRIC_TYPES, group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "5,500", group: "Basics" },
      { key: "sizes", label: "Sizes (S/M/L/XL)", type: "text", required: false, placeholder: "S · M · L · XL", group: "Basics" },
      { key: "piecesCount", label: "Pieces", type: "enum", required: false, enumOptions: PIECE_OPTIONS, group: "Basics" },
      ...COMMON_PHOTO_FIELDS(2),
    ],
    defaultData: {
      title: "Embroidered Lawn 3-Piece",
      fabricType: "Lawn",
      price: "5,500",
      sizes: "S · M · L · XL",
      piecesCount: "3-piece",
    },
    dimensions: "both",
    Render: TemplateNewArrival,
  },
  {
    id: "clothing-sale-drop",
    industry: "clothing_retail",
    name: "Sale Drop",
    description: "Strike-through original price + giant rotated discount badge. Use for clearance pushes.",
    thumbnail: "💸",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Summer Sale — Up to 40% Off", group: "Basics" },
      { key: "originalPrice", label: "Original Price", type: "price", required: false, placeholder: "8,000", group: "Basics" },
      { key: "salePrice", label: "Sale Price", type: "price", required: true, placeholder: "4,800", group: "Basics" },
      { key: "discountPct", label: "Discount %", type: "number", required: false, placeholder: "40", group: "Basics" },
      { key: "sizes", label: "Sizes", type: "text", required: false, placeholder: "All sizes available", group: "Basics" },
      ...COMMON_PHOTO_FIELDS(2),
    ],
    defaultData: {
      title: "Summer Sale Drop",
      originalPrice: "8,000",
      salePrice: "4,800",
      discountPct: "40",
      sizes: "S · M · L · XL",
    },
    dimensions: "both",
    Render: TemplateSaleDrop,
  },
  {
    id: "clothing-seasonal",
    industry: "clothing_retail",
    name: "Seasonal Collection",
    description: "Centered editorial layout for Eid / wedding / season launches.",
    thumbnail: "🌸",
    fields: [
      { key: "collectionName", label: "Collection Name", type: "text", required: true, placeholder: "Eid Festive '26", group: "Basics" },
      { key: "season", label: "Season", type: "enum", required: false, enumOptions: SEASONS, group: "Basics" },
      { key: "tagline", label: "Tagline", type: "text", required: false, placeholder: "Hand-embroidered, gracefully draped", group: "Basics" },
      { key: "priceRange", label: "Price Range", type: "text", required: false, placeholder: "4,500 – 12,000", group: "Basics" },
      ...COMMON_PHOTO_FIELDS(2),
    ],
    defaultData: {
      collectionName: "Eid Festive '26",
      season: "Eid Collection",
      tagline: "Hand-embroidered, gracefully draped",
      priceRange: "4,500 – 12,000",
    },
    dimensions: "both",
    Render: TemplateSeasonalCollection,
  },
  {
    id: "clothing-last-pieces",
    industry: "clothing_retail",
    name: "Last Pieces",
    description: "Urgency-driven layout with pulsing 'only N left' badge for FOMO drops.",
    thumbnail: "⏳",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Lawn Suit — Heritage", group: "Basics" },
      { key: "piecesLeft", label: "Pieces Left", type: "number", required: true, placeholder: "3", group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "6,200", group: "Basics" },
      { key: "urgencyText", label: "Urgency Line", type: "text", required: false, placeholder: "Won't restock — order today", group: "Basics" },
      ...COMMON_PHOTO_FIELDS(0),
    ],
    defaultData: {
      title: "Lawn Suit — Heritage",
      piecesLeft: "3",
      price: "6,200",
      urgencyText: "Won't restock — order today",
    },
    dimensions: "both",
    Render: TemplateLastPieces,
  },
  {
    id: "clothing-stock-refresh",
    industry: "clothing_retail",
    name: "Stock Refresh",
    description: "Multi-photo grid celebrating a fresh batch — perfect for weekly arrivals.",
    thumbnail: "🛍️",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Fresh Lawn Stock", group: "Basics" },
      { key: "itemsCount", label: "How many items", type: "number", required: false, placeholder: "48", group: "Basics" },
      { key: "fromPrice", label: "From price", type: "price", required: false, placeholder: "3,200", group: "Basics" },
      ...COMMON_PHOTO_FIELDS(2),
    ],
    defaultData: {
      title: "Fresh Lawn Stock — Just In",
      itemsCount: "48",
      fromPrice: "3,200",
    },
    dimensions: "both",
    Render: TemplateStockRefresh,
  },
  {
    id: "clothing-bulk-wedding",
    industry: "clothing_retail",
    name: "Bulk / Wedding Order",
    description: "Premium gold-on-deep-purple layout for wedding gifting + bulk orders.",
    thumbnail: "💍",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, placeholder: "Bridal Bulk Orders", group: "Basics" },
      { key: "minQty", label: "Minimum Quantity", type: "text", required: false, placeholder: "10 pieces", group: "Basics" },
      { key: "bulkDiscount", label: "Bulk Discount %", type: "number", required: false, placeholder: "15", group: "Basics" },
      { key: "contactInfo", label: "Contact Info Line", type: "text", required: false, placeholder: "WhatsApp 0300-1234567 for orders", group: "Basics" },
      ...COMMON_PHOTO_FIELDS(0),
    ],
    defaultData: {
      title: "Bridal & Bulk Orders",
      minQty: "10 pieces",
      bulkDiscount: "15",
      contactInfo: "WhatsApp us for custom orders",
    },
    dimensions: "both",
    Render: TemplateBulkOrder,
  },
];
