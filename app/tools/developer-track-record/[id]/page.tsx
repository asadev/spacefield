"use client";

import { useParams } from "next/navigation";
import { useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { developers, Developer, DATA_UPDATED } from "@/lib/developer-data";
import { useCanvasTone } from "@/lib/useCanvasTone";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

function scoreColor(score: number): string {
  if (score >= 8) return "text-blue-300";
  if (score >= 6) return "text-gray-300";
  return "text-gray-500";
}

function barFill(score: number): string {
  if (score >= 8) return "bg-blue-400/60";
  if (score >= 6) return "bg-white/30";
  if (score >= 4) return "bg-white/15";
  return "bg-white/10";
}

function ScoreBar({ label, score, delay = 0 }: { label: string; score: number; delay?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barFill(score)}`}
          initial={{ width: 0 }}
          animate={{ width: `${score * 10}%` }}
          transition={{ duration: 0.7, delay, ease }}
        />
      </div>
      <span className={`w-10 text-right text-sm font-semibold tabular-nums ${scoreColor(score)}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

/* ─── Radar Chart (Canvas 2D) ─── */
function RadarChart({
  delivery,
  quality,
  appreciation,
  size = 200,
}: {
  delivery: number;
  quality: number;
  appreciation: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.38;

    const axes = [
      { label: "Delivery", value: delivery / 10, angle: -Math.PI / 2 },
      { label: "Quality", value: quality / 10, angle: -Math.PI / 2 + (2 * Math.PI) / 3 },
      { label: "Value", value: appreciation / 10, angle: -Math.PI / 2 + (4 * Math.PI) / 3 },
    ];

    ctx.clearRect(0, 0, size, size);

    // Grid rings
    for (let ring = 1; ring <= 5; ring++) {
      const ringR = (r * ring) / 5;
      ctx.beginPath();
      axes.forEach((a, i) => {
        const x = cx + Math.cos(a.angle) * ringR;
        const y = cy + Math.sin(a.angle) * ringR;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axis lines
    axes.forEach((a) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a.angle) * r, cy + Math.sin(a.angle) * r);
      ctx.strokeStyle = `rgba(${tone},0.08)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Data polygon
    ctx.beginPath();
    axes.forEach((a, i) => {
      const x = cx + Math.cos(a.angle) * r * a.value;
      const y = cy + Math.sin(a.angle) * r * a.value;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(96,165,250,0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(96,165,250,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Data points
    axes.forEach((a) => {
      const x = cx + Math.cos(a.angle) * r * a.value;
      const y = cy + Math.sin(a.angle) * r * a.value;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(96,165,250,0.7)";
      ctx.fill();
    });

    // Labels
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillStyle = `rgba(${tone},0.4)`;
    ctx.textAlign = "center";
    axes.forEach((a) => {
      const labelR = r + 18;
      const x = cx + Math.cos(a.angle) * labelR;
      const y = cy + Math.sin(a.angle) * labelR;
      ctx.fillText(a.label, x, y + 4);
    });
  }, [delivery, quality, appreciation, size, tone]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="mx-auto"
    />
  );
}

const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.08 * i, ease },
  }),
};

export default function DeveloperDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const dev = useMemo(() => developers.find((d) => d.id === id), [id]);

  const similar = useMemo(() => {
    if (!dev) return [];
    return developers
      .filter((d) => d.id !== dev.id)
      .map((d) => ({
        ...d,
        diff: Math.abs(d.overallScore - dev.overallScore),
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 4);
  }, [dev]);

  if (!dev) {
    return (
      <main className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-4">Developer not found.</p>
          <Link
            href="/tools/developer-track-record"
            className="text-blue-400/70 text-sm hover:text-blue-300 transition-colors"
          >
            ← Back to all developers
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#000000] pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
        <Link
          href="/tools/developer-track-record"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-300 transition-colors mb-8"
        >
          ← All Developers
        </Link>

        {/* Header */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-100">
                {dev.name}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Est. {dev.established} · {dev.headquarters}
              </p>
            </div>
            <div className="text-right ml-4">
              <span
                className={`text-3xl font-bold tabular-nums ${scoreColor(dev.overallScore)}`}
              >
                {dev.overallScore.toFixed(1)}
              </span>
              <p className="text-[10px] text-gray-600">overall score</p>
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mt-4">
            {dev.description}
          </p>
        </motion.div>

        {/* Scores + Radar */}
        <motion.section
          custom={1}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          <div className="space-y-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
              Scores
            </h2>
            <ScoreBar label="Delivery" score={dev.deliveryScore} delay={0.1} />
            <ScoreBar label="Quality" score={dev.qualityScore} delay={0.2} />
            <ScoreBar label="Appreciation" score={dev.valueAppreciation} delay={0.3} />
            <ScoreBar label="Overall" score={dev.overallScore} delay={0.4} />

            <div className="pt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold text-gray-200 tabular-nums">
                  {dev.completedProjects}
                </p>
                <p className="text-[10px] text-gray-600">Completed</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-200 tabular-nums">
                  {dev.ongoingProjects}
                </p>
                <p className="text-[10px] text-gray-600">Ongoing</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-200 tabular-nums">
                  {dev.upcomingProjects}
                </p>
                <p className="text-[10px] text-gray-600">Upcoming</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <RadarChart
              delivery={dev.deliveryScore}
              quality={dev.qualityScore}
              appreciation={dev.valueAppreciation}
            />
          </div>
        </motion.section>

        {/* Notable Projects */}
        <motion.section
          custom={2}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-10"
        >
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Notable Projects
          </h2>
          <div className="flex flex-wrap gap-2">
            {dev.notableProjects.map((p) => (
              <span
                key={p}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-300"
              >
                {p}
              </span>
            ))}
          </div>
        </motion.section>

        {/* Areas Present */}
        <motion.section
          custom={3}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-8"
        >
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Areas Present
          </h2>
          <div className="flex flex-wrap gap-2">
            {dev.areasPresent.map((a) => (
              <span
                key={a}
                className="text-xs px-3 py-1.5 rounded-full bg-blue-500/[0.07] border border-blue-400/[0.12] text-blue-300/70"
              >
                {a}
              </span>
            ))}
          </div>
        </motion.section>

        {/* Details Grid */}
        <motion.section
          custom={4}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
            <h3 className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              Property Types
            </h3>
            <p className="text-sm text-gray-300">
              {dev.propertyTypes.join(", ")}
            </p>
          </div>
          <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
            <h3 className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              Price Range
            </h3>
            <p className="text-sm text-gray-300">{dev.priceRange}</p>
          </div>
          <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
            <h3 className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              Service Charge (per sqft)
            </h3>
            <p className="text-sm text-gray-300">
              AED {dev.serviceChargeAvg.min} – {dev.serviceChargeAvg.max}
            </p>
          </div>
          <div className="border border-white/[0.06] rounded-xl p-4 bg-white/[0.02]">
            <h3 className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
              3-Year Price Appreciation
            </h3>
            <p className="text-sm text-gray-300">
              {dev.avgPriceAppreciation3y.min}% – {dev.avgPriceAppreciation3y.max}%
            </p>
          </div>
        </motion.section>

        {/* Known For */}
        <motion.section
          custom={5}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-8"
        >
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Known For
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            {dev.knownFor}
          </p>
        </motion.section>

        {/* Tags */}
        <motion.section
          custom={6}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-6"
        >
          <div className="flex flex-wrap gap-1.5">
            {dev.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-gray-500 capitalize"
              >
                {t}
              </span>
            ))}
          </div>
        </motion.section>

        {/* Controversies */}
        {dev.controversies && (
          <motion.section
            custom={7}
            initial="hidden"
            animate="visible"
            variants={sectionVariants}
            className="mt-8"
          >
            <div className="border border-yellow-500/[0.12] rounded-xl p-4 bg-yellow-500/[0.03]">
              <h2 className="text-xs font-medium text-yellow-400/60 uppercase tracking-wider mb-2">
                ⚠ Known Concerns
              </h2>
              <p className="text-sm text-yellow-200/40 leading-relaxed">
                {dev.controversies}
              </p>
            </div>
          </motion.section>
        )}

        {/* Website */}
        <motion.section
          custom={8}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-6"
        >
          <a
            href={dev.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {dev.website.replace("https://", "")}
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
        </motion.section>

        {/* Similar Developers */}
        <motion.section
          custom={9}
          initial="hidden"
          animate="visible"
          variants={sectionVariants}
          className="mt-14"
        >
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">
            Similar Developers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {similar.map((s) => (
              <Link
                key={s.id}
                href={`/tools/developer-track-record/${s.id}`}
                className="group border border-white/[0.06] rounded-xl p-4 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-200 group-hover:text-white">
                      {s.name}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {s.knownFor.slice(0, 80)}...
                    </p>
                  </div>
                  <span
                    className={`text-lg font-bold tabular-nums ${scoreColor(s.overallScore)}`}
                  >
                    {s.overallScore.toFixed(1)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        <p className="text-[10px] text-gray-700 mt-12">
          Data updated {DATA_UPDATED} · Scores are editorial estimates
        </p>
      </div>
    </main>
  );
}
