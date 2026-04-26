"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import TextReveal from "./ui/TextReveal";

/* ─── Types ─── */
type InputType = "inquiry" | "property" | "broadcast";

interface PipelineStep {
  id: number;
  label: string;
  detail: string;
}

/* ─── Data ─── */
const inputs: { key: InputType; label: string; desc: string }[] = [
  { key: "inquiry", label: "New Inquiry", desc: "Incoming lead from website" },
  { key: "property", label: "Property Request", desc: "Buyer requirement submitted" },
  { key: "broadcast", label: "Listing Broadcast", desc: "New property on market" },
];

const pipelineByInput: Record<InputType, PipelineStep[]> = {
  inquiry: [
    { id: 1, label: "Signal Captured", detail: "Lead source, intent, and contact parsed in real time" },
    { id: 2, label: "Data Structured", detail: "Budget, location, timeline mapped to buyer profile" },
    { id: 3, label: "Matching Engine", detail: "Cross-referencing 240+ active listings against criteria" },
    { id: 4, label: "Response Generated", detail: "Personalized property shortlist sent within 90 seconds" },
  ],
  property: [
    { id: 1, label: "Signal Captured", detail: "Requirement details extracted from message or form" },
    { id: 2, label: "Data Structured", detail: "Unit type, ROI target, handover date normalized" },
    { id: 3, label: "Matching Engine", detail: "Scoring properties by relevance, yield, and availability" },
    { id: 4, label: "Response Generated", detail: "Curated options with investment analysis delivered" },
  ],
  broadcast: [
    { id: 1, label: "Signal Captured", detail: "New listing data ingested from developer feed" },
    { id: 2, label: "Data Structured", detail: "Pricing, floor plans, payment plans standardized" },
    { id: 3, label: "Matching Engine", detail: "Identifying 38 buyers with matching criteria" },
    { id: 4, label: "Response Generated", detail: "Targeted broadcast sent to qualified prospects" },
  ],
};

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ─── Component ─── */
export default function SystemSimulation() {
  const [selected, setSelected] = useState<InputType | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.15 });

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  const run = useCallback(
    (input: InputType) => {
      clearTimeouts();
      setComplete(false);
      setSelected(input);
      setActiveStep(0);
      setIsRunning(true);

      const steps = pipelineByInput[input];
      const t: ReturnType<typeof setTimeout>[] = [];

      steps.forEach((_, i) => {
        t.push(setTimeout(() => setActiveStep(i + 1), (i + 1) * 850));
      });
      t.push(
        setTimeout(() => {
          setIsRunning(false);
          setComplete(true);
        }, (steps.length + 1) * 850)
      );

      timeoutsRef.current = t;
    },
    [clearTimeouts]
  );

  const steps = selected ? pipelineByInput[selected] : [];

  return (
    <section
      id="simulation"
      ref={sectionRef}
      className="relative py-[clamp(100px,14vw,180px)] overflow-hidden"
    >
      {/* Top divider */}
      <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 1, ease }}
          style={{ originX: 0 }}
          className="h-px w-full bg-gradient-to-r from-white/20 via-white/8 to-transparent"
        />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 pt-[clamp(60px,8vw,100px)] lg:px-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6, ease }}
          className="mb-4 flex items-center gap-4"
        >
          <span className="flex items-center gap-3 text-[0.65rem] font-medium uppercase tracking-[0.25em] text-gray-200">
            <span className="block h-px w-6 bg-white/30" />
            Live Simulation
          </span>
        </motion.div>

        <div className="mb-14">
          <TextReveal
            as="h2"
            className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.15] tracking-[-0.01em] text-white"
            delay={0.2}
            speed="fast"
          >
            AI System Simulation
          </TextReveal>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.5, ease }}
            className="mt-4 max-w-lg text-[clamp(0.9rem,1.2vw,1.05rem)] leading-[1.7] text-gray-200"
          >
            Select an input to watch how the system processes it — from signal
            to response.
          </motion.p>
        </div>

        {/* Interactive area */}
        <div className="grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-16">
          {/* Input selectors */}
          <div className="flex flex-col gap-3">
            <p className="mb-2 text-[0.6rem] font-medium uppercase tracking-[0.25em] text-gray-300">
              Select Input Signal
            </p>
            {inputs.map((input) => {
              const isActive = selected === input.key;
              return (
                <motion.button
                  key={input.key}
                  onClick={() => run(input.key)}
                  disabled={isRunning}
                  className={`group relative cursor-pointer overflow-hidden px-5 py-4 text-left ${
                    isRunning && !isActive
                      ? "opacity-30 cursor-not-allowed"
                      : ""
                  }`}
                  style={{
                    border: isActive
                      ? "1px solid color-mix(in srgb, var(--text) 22%, transparent)"
                      : "1px solid color-mix(in srgb, var(--text) 10%, transparent)",
                    background: isActive
                      ? "color-mix(in srgb, var(--text) 6%, transparent)"
                      : "color-mix(in srgb, var(--text) 3%, transparent)",
                  }}
                  whileHover={
                    !isRunning
                      ? {
                          scale: 1.01,
                          borderColor: "color-mix(in srgb, var(--text) 20%, transparent)",
                          background: "color-mix(in srgb, var(--text) 5%, transparent)",
                        }
                      : {}
                  }
                  whileTap={!isRunning ? { scale: 0.985 } : {}}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-2 w-2 items-center justify-center">
                        <div
                          className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                            isActive ? "bg-white" : "bg-gray-300/60"
                          }`}
                        />
                        {isActive && isRunning && (
                          <div className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-white/50" />
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium tracking-wide transition-colors duration-300 ${
                          isActive ? "text-white" : "text-gray-200"
                        }`}
                      >
                        {input.label}
                      </span>
                    </div>
                    <p className="mt-1.5 pl-5 text-[0.7rem] text-gray-300">
                      {input.desc}
                    </p>
                  </div>
                </motion.button>
              );
            })}

            <AnimatePresence>
              {complete && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-center text-[0.65rem] text-gray-300"
                >
                  Select again to re-run
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Pipeline visualization */}
          <div className="relative min-h-[440px]">
            {/* Empty state */}
            <AnimatePresence mode="wait">
              {!selected && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  className="flex h-full items-center justify-center"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-14 w-14 rounded-full border border-white/[0.12]">
                      <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white/25" />
                    </div>
                    <p className="text-sm text-gray-300">
                      Select an input to begin
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pipeline steps */}
            <AnimatePresence mode="wait">
              {selected && (
                <motion.div
                  key={selected}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  className="flex flex-col"
                >
                  {steps.map((step, i) => {
                    const isReached = activeStep >= step.id;
                    const isCurrent = activeStep === step.id;
                    const isLast = i === steps.length - 1;

                    return (
                      <div key={step.id}>
                        {/* Node row */}
                        <div className="flex items-start gap-5">
                          {/* Node */}
                          <div className="relative flex flex-col items-center">
                            {/* Pulse */}
                            <AnimatePresence>
                              {isCurrent && (
                                <motion.div
                                  key={`p-${step.id}-${activeStep}`}
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{
                                    scale: [1, 2, 2.5],
                                    opacity: [0.3, 0.1, 0],
                                  }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className="absolute top-0 left-1/2 h-10 w-10 -translate-x-1/2 -translate-y-[3px] rounded-full border border-white/30"
                                />
                              )}
                            </AnimatePresence>

                            <motion.div
                              initial={false}
                              animate={{
                                scale: isReached ? 1 : 0.7,
                                opacity: isReached ? 1 : 0.3,
                              }}
                              transition={{ duration: 0.4, ease }}
                              className="relative z-10 flex h-10 w-10 items-center justify-center"
                            >
                              <div
                                className={`absolute inset-0 rounded-full border transition-all duration-500 ${
                                  isReached
                                    ? "border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.12)]"
                                    : "border-white/[0.12]"
                                }`}
                              />
                              <motion.div
                                initial={false}
                                animate={{
                                  scale: isReached ? 1 : 0.3,
                                  backgroundColor: isReached
                                    ? "var(--text)"
                                    : "color-mix(in srgb, var(--text) 15%, transparent)",
                                }}
                                transition={{ duration: 0.3, ease }}
                                className="h-2.5 w-2.5 rounded-full"
                              />
                              {isReached && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="absolute inset-0 rounded-full bg-white/[0.08] blur-sm"
                                />
                              )}
                            </motion.div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 pt-1.5 pb-2">
                            <motion.div
                              initial={false}
                              animate={{
                                opacity: isReached ? 1 : 0.25,
                                x: isReached ? 0 : 10,
                                filter: isReached ? "blur(0px)" : "blur(3px)",
                              }}
                              transition={{ duration: 0.5, ease }}
                            >
                              <div className="flex items-center gap-3">
                                <h4
                                  className={`text-sm font-semibold tracking-wide transition-colors duration-500 ${
                                    isReached ? "text-white" : "text-gray-300"
                                  }`}
                                >
                                  {step.label}
                                </h4>

                                <AnimatePresence>
                                  {isCurrent && (
                                    <motion.span
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.8 }}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.15em] text-gray-200"
                                    >
                                      <span className="h-1 w-1 rounded-full bg-white/70 animate-pulse" />
                                      Processing
                                    </motion.span>
                                  )}
                                  {isReached && !isCurrent && (
                                    <motion.span
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      className="inline-flex rounded-full border border-white/[0.12] px-2.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-[0.15em] text-gray-200"
                                    >
                                      Complete
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </div>

                              <AnimatePresence>
                                {isReached && (
                                  <motion.p
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                      duration: 0.4,
                                      ease,
                                      delay: 0.1,
                                    }}
                                    className="mt-1.5 text-sm leading-relaxed text-gray-300"
                                  >
                                    {step.detail}
                                  </motion.p>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          </div>
                        </div>

                        {/* Connecting line */}
                        {!isLast && (
                          <div className="flex">
                            <div className="flex w-10 justify-center">
                              <motion.div
                                initial={false}
                                animate={{
                                  scaleY: isReached ? 1 : 0,
                                  opacity: isReached ? 1 : 0.15,
                                }}
                                transition={{ duration: 0.4, ease }}
                                style={{ originY: 0 }}
                                className={`h-8 w-px ${
                                  isReached
                                    ? "bg-gradient-to-b from-white/35 to-white/8"
                                    : "bg-white/[0.08]"
                                }`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Output card */}
                  <AnimatePresence>
                    {complete && (
                      <motion.div
                        initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.6, ease, delay: 0.2 }}
                        className="mt-6 ml-[60px] overflow-hidden border border-white/15 bg-white/[0.04]"
                      >
                        <div className="relative px-5 py-4">
                          <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: "200%" }}
                            transition={{
                              duration: 1.5,
                              ease: "easeInOut",
                              delay: 0.3,
                            }}
                            className="pointer-events-none absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
                          />
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-white/80" />
                            <p className="text-[0.6rem] font-medium uppercase tracking-[0.15em] text-gray-200">
                              System Output Ready
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-gray-200">
                            {selected === "inquiry" &&
                              "Personalized property shortlist delivered to lead via WhatsApp. CRM updated. Follow-up scheduled."}
                            {selected === "property" &&
                              "Investment-matched properties delivered with ROI projections. Agent notified for high-value lead."}
                            {selected === "broadcast" &&
                              "Targeted notifications sent to 38 qualified buyers. Viewing requests auto-scheduled."}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
