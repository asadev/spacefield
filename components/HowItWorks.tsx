"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const steps = [
  {
    number: "01",
    duration: "1–2 weeks",
    title: "Deep Audit",
    description:
      "I map every workflow in your operation — lead sources, response chains, data flow, team processes. Find every bottleneck, every manual step, every leak.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="22" y2="22" />
      </svg>
    ),
  },
  {
    number: "02",
    duration: "2–4 weeks",
    title: "System Design & Build",
    description:
      "Custom AI systems built around your exact operation. Not generic templates — real automation that fits how your team actually works. WhatsApp, CRM, sheets, everything connected.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    number: "03",
    duration: "Ongoing",
    title: "Launch & Optimize",
    description:
      "Systems go live. Your team trains in one session. I monitor, optimize, and expand. The goal: your operation runs itself while you focus on closing deals.",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, margin: "-80px" });

  return (
    <section
      ref={sectionRef}
      className="relative py-14 md:py-24 px-4 md:px-8 overflow-hidden bg-app"
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 md:mb-20"
        >
          <span className="inline-block text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4 px-3 py-1 rounded-full border border-white/[0.10] bg-white/[0.05]">
            Process
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-white mt-4 leading-tight">
            Three Steps to Autonomous Operations
          </h2>
        </motion.div>

        {/* Steps — horizontal scroll on mobile, 3-col on desktop */}
        <div className="relative flex md:flex-row md:items-stretch md:gap-0 overflow-x-auto md:overflow-visible snap-x snap-mandatory gap-3 pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {steps.map((step, i) => (
            <div key={i} className="relative flex-shrink-0 w-[75vw] md:w-auto md:flex-1 flex items-stretch snap-start">
              {/* Card */}
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.18 }}
                className="flex-1 flex flex-col p-4 md:p-7 rounded-2xl border border-white/[0.10] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05] transition-all duration-300 group mx-0 md:mx-3"
              >
                {/* Step number — hidden on mobile */}
                <motion.div
                  animate={
                    inView
                      ? {
                          opacity: [0.4, 1, 0.4],
                        }
                      : {}
                  }
                  transition={{
                    duration: 3,
                    delay: 0.4 + i * 0.18,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="hidden md:block text-5xl font-black text-white/10 leading-none mb-5 select-none"
                >
                  {step.number}
                </motion.div>

                {/* Icon + Title: inline on mobile, stacked on desktop */}
                <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-0">
                  <div className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.05] text-gray-300 md:mb-5 group-hover:border-white/[0.20] group-hover:text-white transition-colors duration-300 flex-shrink-0">
                    {step.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base md:text-xl md:mb-3">{step.title}</h3>
                </div>

                {/* Description — clamped on mobile */}
                <p className="text-gray-400 text-sm leading-relaxed flex-1 mt-2 md:mt-0 line-clamp-2 md:line-clamp-none">{step.description}</p>

                {/* Duration tag */}
                <div className="mt-3 md:mt-6">
                  <span className="inline-block text-xs font-semibold tracking-wide text-gray-500 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03]">
                    {step.duration}
                  </span>
                </div>
              </motion.div>

              {/* Dotted connector line (between cards, desktop only) */}
              {i < steps.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 z-10 items-center justify-center w-6">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.18 }}
                    className="flex flex-col gap-[3px] items-center"
                  >
                    {Array.from({ length: 5 }).map((_, j) => (
                      <motion.div
                        key={j}
                        initial={{ opacity: 0 }}
                        animate={inView ? { opacity: 1 } : {}}
                        transition={{
                          duration: 0.3,
                          delay: 0.55 + i * 0.18 + j * 0.06,
                        }}
                        className="w-1 h-1 rounded-full bg-white/20"
                      />
                    ))}
                  </motion.div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Scroll hint dots for mobile */}
        <div className="flex md:hidden justify-center gap-1.5 mt-3">
          {steps.map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20" />
          ))}
        </div>
      </div>
    </section>
  );
}
