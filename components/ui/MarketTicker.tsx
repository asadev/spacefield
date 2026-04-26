"use client";
import { motion } from "framer-motion";

const tickerData = [
  { area: "Downtown Dubai", price: "AED 2,850/sqft", change: "+12.4%" },
  { area: "Dubai Marina", price: "AED 2,100/sqft", change: "+8.7%" },
  { area: "JVC", price: "AED 980/sqft", change: "+15.2%" },
  { area: "Business Bay", price: "AED 1,920/sqft", change: "+10.1%" },
  { area: "Palm Jumeirah", price: "AED 3,400/sqft", change: "+6.8%" },
  { area: "Dubai Hills", price: "AED 1,650/sqft", change: "+14.3%" },
  { area: "Creek Harbour", price: "AED 2,200/sqft", change: "+18.5%" },
  { area: "JBR", price: "AED 2,600/sqft", change: "+9.2%" },
  { area: "DIFC", price: "AED 3,100/sqft", change: "+7.5%" },
  { area: "MBR City", price: "AED 1,800/sqft", change: "+11.9%" },
];

export default function MarketTicker() {
  const items = [...tickerData, ...tickerData]; // duplicate for seamless loop

  return (
    <div className="relative w-full overflow-hidden border-y border-white/[0.06] bg-white/[0.02] py-3">
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-20" style={{ background: "linear-gradient(to right, var(--edge-fade), transparent)" }} />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-20" style={{ background: "linear-gradient(to left, var(--edge-fade), transparent)" }} />

      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      >
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-3 text-sm">
            <span className="font-medium text-white/70">{item.area}</span>
            <span className="text-white/40">{item.price}</span>
            <span className="font-medium text-emerald-400">{item.change}</span>
            <span className="text-white/10">|</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
