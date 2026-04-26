"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useAnimation } from "framer-motion";

const beforeItems = [
  {
    title: "Lead Response: 4+ hours",
    desc: "Leads from portals, social media, and walk-ins sat in spreadsheets. Agents cherry-picked. Most went cold.",
  },
  {
    title: "Broadcasting: Manual copy-paste",
    desc: "Marketing team spent 3 hours daily copy-pasting listings to 22 WhatsApp groups. One by one.",
  },
  {
    title: "Inventory: 6 disconnected sheets",
    desc: "Main inventory, public group data, distress deals — all in separate Google Sheets with no sync.",
  },
  {
    title: "Sales Offers: 45 min each",
    desc: "Agents manually filled PandaDoc templates. 12 separate scenarios for 12 agents. Constant errors.",
  },
  {
    title: "Reporting: Doesn't exist",
    desc: "Owner asks 'how are we doing?' — nobody knows. Data everywhere, insights nowhere.",
  },
];

const afterItems = [
  {
    title: "Lead Response: 90 seconds",
    desc: "AI classifies every inquiry, matches against 500+ listings, sends personalized property shortlist via WhatsApp. Automatically.",
  },
  {
    title: "Broadcasting: One click",
    desc: "New listing → AI formats → approval button → broadcasts to all 22 groups with professional formatting. 30 seconds.",
  },
  {
    title: "Inventory: One live dashboard",
    desc: "All sources sync every 60 seconds. Main inventory, market intelligence, and distress deals in one consolidated view.",
  },
  {
    title: "Sales Offers: Instant",
    desc: "Agent enters details → professional PDF generated with property photos, floor plans, payment plans. One workflow handles all agents.",
  },
  {
    title: "Reporting: Real-time",
    desc: "Weekly automated reports to the owner. Pipeline visibility, response times, conversion rates — all tracked.",
  },
];

const stats = [
  { value: "90s", label: "Average Response Time" },
  { value: "22", label: "Groups Auto-Broadcast" },
  { value: "500+", label: "Listings Cross-Referenced" },
];

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center gap-1 md:gap-2"
    >
      <span className="text-3xl md:text-5xl font-bold text-white tracking-tight">
        {value}
      </span>
      <span className="text-xs md:text-sm text-gray-400 text-center">{label}</span>
    </motion.div>
  );
}

export default function BeforeAfter() {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, margin: "-80px" });

  return (
    <section
      ref={sectionRef}
      className="relative py-14 md:py-24 px-4 md:px-8 overflow-hidden bg-app"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 md:mb-16"
        >
          <span className="inline-block text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4 px-3 py-1 rounded-full border border-white/[0.10] bg-white/[0.05]">
            Case Study
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 mb-4 leading-tight">
            From Manual Chaos to<br className="hidden md:block" /> AI-Powered Operations
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            See how a Dubai real estate brokerage transformed their entire workflow
          </p>
        </motion.div>

        {/* ===== MOBILE: Paired comparison rows (visible < md) ===== */}
        <div className="md:hidden space-y-3">
          {beforeItems.map((before, i) => {
            const after = afterItems[i];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                className="grid grid-cols-2 gap-2"
              >
                {/* Before item */}
                <div className="flex items-start gap-2 p-3 rounded-xl border border-white/[0.10] bg-white/[0.02]">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-white/[0.04] text-gray-600 text-[10px] font-bold">
                    ✕
                  </span>
                  <p className="text-white font-medium text-xs leading-snug">{before.title}</p>
                </div>
                {/* After item */}
                <div className="flex items-start gap-2 p-3 rounded-xl border border-white/[0.10] bg-white/[0.02]">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-white/[0.08] text-gray-300 text-[10px] font-bold">
                    ✓
                  </span>
                  <p className="text-white font-medium text-xs leading-snug">{after.title}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ===== DESKTOP: Original Before / After columns (visible >= md) ===== */}
        <div className="hidden md:flex relative flex-col md:flex-row gap-0 md:gap-0 items-stretch">
          {/* BEFORE column */}
          <div className="flex-1 pr-0 md:pr-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mb-6"
            >
              <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                Before
              </span>
            </motion.div>
            <div className="space-y-4">
              {beforeItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -40 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="flex gap-3 p-4 rounded-xl border border-white/[0.10] bg-white/[0.02] hover:border-white/[0.16] transition-colors group"
                >
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.04] text-gray-600 text-xs font-bold">
                    ✕
                  </span>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">{item.title}</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Center divider */}
          <div className="relative flex items-center justify-center my-8 md:my-0 md:mx-4">
            <motion.div
              initial={{ scaleY: 0 }}
              animate={inView ? { scaleY: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="w-px h-full origin-top"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--text) 15%, transparent) 20%, color-mix(in srgb, var(--text) 15%, transparent) 80%, transparent)",
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.7 }}
              className="absolute z-10 flex items-center justify-center w-10 h-10 rounded-full border border-app bg-app text-xs font-bold text-app"
              style={{
                boxShadow: "0 0 20px 4px rgba(99,102,241,0.25), 0 0 6px 1px rgba(99,102,241,0.4)",
              }}
            >
              AI
            </motion.div>
          </div>

          {/* AFTER column */}
          <div className="flex-1 pl-0 md:pl-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mb-6"
            >
              <span className="text-xs font-bold tracking-widest text-gray-300 uppercase">
                After
              </span>
            </motion.div>
            <div className="space-y-4">
              {afterItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 40 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="flex gap-3 p-4 rounded-xl border border-white/[0.10] bg-white/[0.02] hover:border-white/[0.16] transition-colors group"
                >
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.08] text-gray-300 text-xs font-bold">
                    ✓
                  </span>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">{item.title}</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats bar — single column on mobile, 3-col on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-10 md:mt-16 grid grid-cols-3 gap-4 md:gap-6 rounded-2xl border border-white/[0.10] bg-white/[0.03] px-5 py-6 md:px-8 md:py-10"
        >
          {stats.map((stat, i) => (
            <AnimatedStat key={i} value={stat.value} label={stat.label} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
