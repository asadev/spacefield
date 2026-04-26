"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import TextReveal from "./ui/TextReveal";
import LineReveal from "./ui/LineReveal";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export default function AuthoritySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section
      ref={ref}
      className="relative pt-[clamp(40px,6vw,80px)] pb-[clamp(100px,14vw,180px)] overflow-hidden bg-app"
    >
      {/* No ambient glow — pure dark background */}

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-10">
        {/* Section indicator */}


        {/* Split layout */}
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20 items-center">
          {/* Left — Image placeholder */}
          <motion.div
            initial={{ opacity: 0, x: -50, filter: "blur(8px)" }}
            animate={inView ? { opacity: 1, x: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 1, delay: 0.2, ease }}
            className="relative"
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-bg">
              <Image
                src="/asad.jpg"
                alt="Asad Iqbal"
                width={600}
                height={800}
                priority
                className="absolute inset-0 h-full w-full object-contain object-center"
                style={{ filter: "grayscale(100%) contrast(1.05) brightness(1.15)" }}
              />
              {/* Subtle bottom fade */}
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
              {/* Corner accents */}
              <div className="absolute top-0 left-0 z-10 h-8 w-px bg-white/30" />
              <div className="absolute top-0 left-0 z-10 h-px w-8 bg-white/30" />
              <div className="absolute right-0 bottom-0 z-10 h-8 w-px bg-white/30" />
              <div className="absolute right-0 bottom-0 z-10 h-px w-8 bg-white/30" />
            </div>

            {/* Label bar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.8, ease }}
              className="mt-4 flex items-center justify-between"
            >
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-gray-300">
                Dubai, UAE
              </span>
              <span className="h-px w-8 bg-white/20" />
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-gray-300">
                Est. 2019
              </span>
            </motion.div>
          </motion.div>

          {/* Right — Text content */}
          <motion.div
            initial={{ opacity: 0, x: 50, filter: "blur(8px)" }}
            animate={inView ? { opacity: 1, x: 0, filter: "blur(0px)" } : {}}
            transition={{ duration: 1, delay: 0.4, ease }}
          >
            <TextReveal
              as="h2"
              className="text-[clamp(1.8rem,3.5vw,3rem)] font-bold leading-[1.15] tracking-[-0.01em] text-white"
              delay={0.5}
              speed="fast"
            >
              Built from Inside the Industry
            </TextReveal>

            <div className="mt-8 space-y-0">
              <LineReveal
                index={0}
                delay={0.8}
                className="text-[clamp(0.95rem,1.2vw,1.1rem)] leading-[1.8] text-gray-200"
              >
                I design AI systems that replace manual workflows, uncover hidden opportunities, and bring structure to how businesses operate.
              </LineReveal>

              <LineReveal
                index={1}
                delay={0.8}
                className="mt-4 text-[clamp(0.95rem,1.2vw,1.1rem)] leading-[1.8] text-gray-200"
              >
                Starting with real estate — where I built and tested every system from inside a live operation.
              </LineReveal>

              <LineReveal
                index={2}
                delay={0.8}
                className="mt-4 text-[clamp(0.95rem,1.2vw,1.1rem)] leading-[1.8] text-gray-200"
              >
                Not theoretical solutions. Real systems, running in real businesses.
              </LineReveal>


            </div>




          </motion.div>
        </div>
      </div>
    </section>
  );
}
