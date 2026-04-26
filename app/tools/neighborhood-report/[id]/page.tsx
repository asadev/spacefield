"use client";
import { useParams } from "next/navigation";
import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import PageHeader from "@/components/layout/PageHeader";
import { communities, Community, DATA_UPDATED } from "@/lib/neighborhood-data";
import { computeAllScores, getScoreLabel, type CommunityScores } from "@/lib/neighborhood-scoring";
import { useCanvasTone } from "@/lib/useCanvasTone";

/* ─── Muted blue accent score helpers ─── */
function monoScoreText(score: number): string {
  if (score >= 8) return "text-blue-300";
  if (score >= 6) return "text-gray-300";
  return "text-gray-500";
}
function monoScoreBarFill(score: number): string {
  if (score >= 8) return "bg-blue-400/60";
  if (score >= 6) return "bg-white/40";
  if (score >= 4) return "bg-white/20";
  return "bg-white/10";
}
function heroScoreText(score: number): string {
  if (score >= 8) return "text-blue-300";
  if (score >= 6) return "text-gray-200";
  return "text-gray-400";
}

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const sectionVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.08 * i, ease },
  }),
};

/* ─── Dubai Averages ─── */
function computeDubaiAverages(allCommunities: Community[], allScores: Map<string, CommunityScores>) {
  const n = allCommunities.length;
  const avg = {
    pricePerSqftMin: 0, pricePerSqftMax: 0,
    priceRangeMin: 0, priceRangeMax: 0,
    priceChangeYoYMin: 0, priceChangeYoYMax: 0,
    transactionVolume: 0,
    serviceChargeMin: 0, serviceChargeMax: 0,
    rentalYieldMin: 0, rentalYieldMax: 0,
    capitalAppreciation3yMin: 0, capitalAppreciation3yMax: 0,
    metroDistanceKm: 0,
    commuteDifc: 0, commuteBusinessBay: 0, commuteMarina: 0, commuteAirport: 0,
    walkabilityScore: 0,
    beachDistanceKm: 0,
    nearbyNurseries: 0, playAreas: 0, schoolCount: 0,
    completionStatus: 0,
    overallScore: 0, investmentScore: 0, connectivityScore: 0,
    livabilityScore: 0, familyScore: 0, growthScore: 0, valueScore: 0,
  };

  for (const c of allCommunities) {
    avg.pricePerSqftMin += c.pricing.pricePerSqft.min;
    avg.pricePerSqftMax += c.pricing.pricePerSqft.max;
    avg.priceRangeMin += c.pricing.priceRangeAed[0];
    avg.priceRangeMax += c.pricing.priceRangeAed[1];
    avg.priceChangeYoYMin += c.pricing.priceChangeYoY.min;
    avg.priceChangeYoYMax += c.pricing.priceChangeYoY.max;
    const txParts = c.pricing.transactionVolume12m.split("-").map(Number);
    avg.transactionVolume += txParts.length === 2 ? (txParts[0] + txParts[1]) / 2 : txParts[0] || 0;
    avg.serviceChargeMin += c.pricing.serviceChargePerSqft.min;
    avg.serviceChargeMax += c.pricing.serviceChargePerSqft.max;
    avg.rentalYieldMin += c.investment.rentalYieldPct.min;
    avg.rentalYieldMax += c.investment.rentalYieldPct.max;
    avg.capitalAppreciation3yMin += c.investment.capitalAppreciation3y.min;
    avg.capitalAppreciation3yMax += c.investment.capitalAppreciation3y.max;
    avg.metroDistanceKm += c.connectivity.nearestMetro.distanceKm;
    avg.commuteDifc += c.connectivity.commuteMinutes.difc;
    avg.commuteBusinessBay += c.connectivity.commuteMinutes.businessBay;
    avg.commuteMarina += c.connectivity.commuteMinutes.marina;
    avg.commuteAirport += c.connectivity.commuteMinutes.airport;
    avg.walkabilityScore += c.connectivity.walkabilityScore;
    avg.beachDistanceKm += c.livability.beachDistanceKm;
    avg.nearbyNurseries += c.familyFriendliness.nearbyNurseries;
    avg.playAreas += c.familyFriendliness.playAreas;
    avg.schoolCount += c.familyFriendliness.schools.length;
    avg.completionStatus += c.futureGrowth.completionStatus;
    const s = allScores.get(c.id);
    if (s) {
      avg.overallScore += s.overall;
      avg.investmentScore += s.investment;
      avg.connectivityScore += s.connectivity;
      avg.livabilityScore += s.livability;
      avg.familyScore += s.family;
      avg.growthScore += s.growth;
      avg.valueScore += s.value;
    }
  }

  for (const key of Object.keys(avg) as (keyof typeof avg)[]) {
    (avg as any)[key] = avg[key] / n;
  }

  return avg;
}

type VsAvgResult = { direction: "above" | "below" | "similar"; label: string; color: string };

function vsAvg(value: number, avgValue: number, invert = false): VsAvgResult {
  const threshold = Math.abs(avgValue) * 0.05;
  const diff = value - avgValue;
  if (Math.abs(diff) <= threshold) return { direction: "similar", label: "─ Similar", color: "text-gray-500" };
  const isAbove = invert ? diff < -threshold : diff > threshold;
  if (isAbove) return { direction: "above", label: "▲ Above avg", color: "text-blue-300" };
  return { direction: "below", label: "▼ Below avg", color: "text-gray-500" };
}

/* ─── Radar Chart (400px) ─── */
function RadarChart({ scores }: { scores: CommunityScores }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tone = useCanvasTone();
  const categories = [
    { key: "investment", label: "Investment" },
    { key: "connectivity", label: "Connectivity" },
    { key: "livability", label: "Livability" },
    { key: "family", label: "Family" },
    { key: "growth", label: "Growth" },
    { key: "value", label: "Value" },
  ] as const;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 400;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = 150;
    const n = 6;
    const angleStep = (Math.PI * 2) / n;
    const startAngle = -Math.PI / 2;

    // Grid rings
    for (let ring = 1; ring <= 5; ring++) {
      const rr = (r * ring) / 5;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = startAngle + i * angleStep;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axes
    for (let i = 0; i < n; i++) {
      const a = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.strokeStyle = `rgba(${tone},0.06)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Data polygon
    const values = categories.map((c) => scores[c.key] / 10);
    ctx.beginPath();
    values.forEach((v, i) => {
      const a = startAngle + i * angleStep;
      const x = cx + Math.cos(a) * r * v;
      const y = cy + Math.sin(a) * r * v;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(147,197,253,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(147,197,253,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots at data points
    values.forEach((v, i) => {
      const a = startAngle + i * angleStep;
      const x = cx + Math.cos(a) * r * v;
      const y = cy + Math.sin(a) * r * v;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(147,197,253,0.7)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Labels with score numbers
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    categories.forEach((c, i) => {
      const a = startAngle + i * angleStep;
      const lx = cx + Math.cos(a) * (r + 32);
      const ly = cy + Math.sin(a) * (r + 32);
      const score = scores[c.key];

      // Label
      ctx.fillStyle = `rgba(${tone},0.45)`;
      ctx.fillText(c.label, lx, ly - 8);

      // Score number
      ctx.fillStyle = `rgba(${tone},0.65)`;
      ctx.fillText(score.toFixed(1), lx, ly + 8);
    });
  }, [scores, tone]);

  return <canvas ref={canvasRef} className="mx-auto max-w-full" />;
}

/* ─── Stat Card with vs avg ─── */
function StatCard({
  label,
  value,
  sub,
  comparison,
}: {
  label: string;
  value: string | number;
  sub?: string;
  comparison?: VsAvgResult | null;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      {comparison && (
        <p className={`mt-1 text-[11px] font-medium ${comparison.color}`}>
          {comparison.label}
        </p>
      )}
    </div>
  );
}

/* ─── Score Bar ─── */
function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min(100, (score / 10) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${monoScoreText(score)}`}>
          {score.toFixed(1)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full transition-all ${monoScoreBarFill(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Section Wrapper ─── */
function Section({
  title,
  id,
  index,
  children,
}: {
  title: string;
  id: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={sectionVariants}
      className="scroll-mt-24 rounded-xl border border-white/[0.10] bg-white/[0.04] p-6 sm:p-8"
    >
      <h2 className="mb-5 text-xl font-semibold text-white">{title}</h2>
      {children}
    </motion.section>
  );
}

/* ─── Table of Contents ─── */
const TOC_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "scores", label: "Scores" },
  { id: "radar", label: "Radar" },
  { id: "investment", label: "Investment" },
  { id: "connectivity", label: "Connectivity" },
  { id: "livability", label: "Livability" },
  { id: "schools", label: "Schools" },
  { id: "growth", label: "Growth" },
  { id: "similar", label: "Similar" },
  { id: "download", label: "Download" },
];

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <>
      {/* Desktop: sticky sidebar */}
      <nav className="no-print hidden lg:block fixed left-6 top-1/2 -translate-y-1/2 z-40">
        <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-[#0a0a0a]/90 backdrop-blur-md p-3">
          {TOC_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeId === item.id
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.05]"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Mobile: horizontal scroll bar */}
      <div className="no-print lg:hidden sticky top-0 z-40 -mx-6 px-6 py-3 bg-[#000000]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {TOC_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                activeId === item.id
                  ? "bg-blue-500/15 text-blue-300"
                  : "bg-white/[0.05] text-gray-500 hover:text-gray-300"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Similar Communities ─── */
function SimilarCommunities({
  currentId,
  allScores,
}: {
  currentId: string;
  allScores: Map<string, CommunityScores>;
}) {
  const currentScore = allScores.get(currentId);
  if (!currentScore) return null;

  const ranked = communities
    .filter((c) => c.id !== currentId)
    .map((c) => {
      const s = allScores.get(c.id);
      if (!s) return null;
      const diff = Math.abs(s.overall - currentScore.overall);
      return { community: c, scores: s, diff };
    })
    .filter(Boolean)
    .sort((a, b) => a!.diff - b!.diff)
    .slice(0, 4) as { community: Community; scores: CommunityScores; diff: number }[];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ranked.map(({ community: sim, scores: simScores }) => (
        <Link
          key={sim.id}
          href={`/tools/neighborhood-report/${sim.id}`}
          className="group rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-white/[0.15] hover:bg-white/[0.06]"
        >
          <h4 className="font-semibold text-white group-hover:text-gray-200 transition-colors">
            {sim.name}
          </h4>
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-2xl font-bold tabular-nums ${simScores.overall >= 8 ? "text-blue-300" : simScores.overall >= 6 ? "text-gray-200" : "text-gray-400"}`}>
              {simScores.overall.toFixed(1)}
            </span>
            <span className="text-xs text-gray-300">
              {getScoreLabel(simScores.overall)}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            AED {sim.pricing.pricePerSqft.min.toLocaleString()} – {sim.pricing.pricePerSqft.max.toLocaleString()} / sqft
          </p>
          <p className="text-xs text-gray-500">
            Yield: {sim.investment.rentalYieldPct.min}% – {sim.investment.rentalYieldPct.max}%
          </p>
        </Link>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function NeighborhoodDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeSection, setActiveSection] = useState("overview");

  const community = useMemo(() => communities.find((c) => c.id === id), [id]);
  const allScores = useMemo(() => computeAllScores(communities), []);
  const scores = community ? allScores.get(community.id) ?? null : null;
  const dubaiAvg = useMemo(() => computeDubaiAverages(communities, allScores), [allScores]);

  // Intersection observer for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    for (const item of TOC_ITEMS) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  if (!community || !scores) {
    return (
      <main className="min-h-screen bg-[#000000] text-[#f5f5f5] flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold text-white">Community Not Found</h1>
        <p className="mt-3 text-gray-400">
          The neighborhood you&apos;re looking for doesn&apos;t exist in our database.
        </p>
        <Link
          href="/tools/neighborhood-report"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          ← Back to All Neighborhoods
        </Link>
      </main>
    );
  }

  const c = community;
  const avgPriceMid = (dubaiAvg.pricePerSqftMin + dubaiAvg.pricePerSqftMax) / 2;
  const thisPriceMid = (c.pricing.pricePerSqft.min + c.pricing.pricePerSqft.max) / 2;
  const avgYieldMid = (dubaiAvg.rentalYieldMin + dubaiAvg.rentalYieldMax) / 2;
  const thisYieldMid = (c.investment.rentalYieldPct.min + c.investment.rentalYieldPct.max) / 2;
  const avgCapMid = (dubaiAvg.capitalAppreciation3yMin + dubaiAvg.capitalAppreciation3yMax) / 2;
  const thisCapMid = (c.investment.capitalAppreciation3y.min + c.investment.capitalAppreciation3y.max) / 2;
  const avgYoYMid = (dubaiAvg.priceChangeYoYMin + dubaiAvg.priceChangeYoYMax) / 2;
  const thisYoYMid = (c.pricing.priceChangeYoY.min + c.pricing.priceChangeYoY.max) / 2;
  const avgScMid = (dubaiAvg.serviceChargeMin + dubaiAvg.serviceChargeMax) / 2;
  const thisScMid = (c.pricing.serviceChargePerSqft.min + c.pricing.serviceChargePerSqft.max) / 2;

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          html, body { background: #000000 !important; color: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0 !important; padding: 0 !important; }
          .no-print, nav, footer, header { display: none !important; }
          main { background: #000000 !important; padding: 24px !important; }
          * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          section { break-inside: avoid; page-break-inside: avoid; }
          #download { display: none !important; }
          .print\\:block { display: block !important; }
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <main className="min-h-screen bg-[#000000] text-[#f5f5f5]">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
          {/* Back link */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease }}
            className="pt-24 no-print"
          >
            <Link
              href="/tools/neighborhood-report"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-white"
            >
              ← All Neighborhoods
            </Link>
          </motion.div>
        </div>

        <PageHeader label="Neighborhood Report" title={c.name} color="purple" />

        <div className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-10 relative">
          <TableOfContents activeId={activeSection} />

          {/* Overall Score Hero */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease }}
            className="mb-10 flex flex-col items-center"
          >
            <div className={`text-7xl font-bold tabular-nums ${heroScoreText(scores.overall)}`}>
              {scores.overall.toFixed(1)}
            </div>
            <div className="mt-2 text-lg font-medium text-gray-300">
              {getScoreLabel(scores.overall)}
            </div>
            <p className="mt-1 text-sm text-gray-500">Overall Quality Score</p>
          </motion.div>

          <div className="space-y-8">
            {/* 1. Overview */}
            <Section title="Overview" id="overview" index={0}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-400">Developer</p>
                  <p className="text-white">{c.developer}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Status</p>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                      c.status === "established" ? "bg-blue-500/10 text-blue-300/80" :
                      c.status === "emerging" ? "bg-white/[0.06] text-gray-300" :
                      "bg-white/[0.06] text-gray-400"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Ownership</p>
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                      c.freeholdStatus === "freehold" ? "bg-white/[0.08] text-gray-300" :
                      "bg-white/[0.05] text-gray-500"
                    }`}
                  >
                    {c.freeholdStatus}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Property Types</p>
                  <p className="text-gray-300 capitalize">{c.propertyTypes.join(", ")}</p>
                </div>
              </div>
              <p className="mt-5 text-gray-300 leading-relaxed">{c.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Section>

            {/* 2 & 3. Score Breakdown + Radar Chart — side by side on desktop */}
            <div className="grid gap-8 lg:grid-cols-2">
              <Section title="Score Breakdown" id="scores" index={1}>
                <div className="space-y-4">
                  <ScoreBar label="Overall" score={scores.overall} />
                  <div className="my-3 h-px bg-white/[0.08]" />
                  <ScoreBar label="Investment" score={scores.investment} />
                  <ScoreBar label="Connectivity" score={scores.connectivity} />
                  <ScoreBar label="Livability" score={scores.livability} />
                  <ScoreBar label="Family" score={scores.family} />
                  <ScoreBar label="Future Growth" score={scores.growth} />
                  <ScoreBar label="Value for Money" score={scores.value} />
                </div>
              </Section>

              <Section title="Score Radar" id="radar" index={2}>
                <div className="flex justify-center items-center h-full">
                  <RadarChart scores={scores} />
                </div>
              </Section>
            </div>

            {/* 4. Investment & Pricing */}
            <Section title="Investment & Pricing" id="investment" index={3}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Price / sqft"
                  value={`AED ${c.pricing.pricePerSqft.min.toLocaleString()} – ${c.pricing.pricePerSqft.max.toLocaleString()}`}
                  comparison={vsAvg(thisPriceMid, avgPriceMid)}
                />
                <StatCard
                  label="Total Price Range"
                  value={`AED ${formatPrice(c.pricing.priceRangeAed[0])} – ${formatPrice(c.pricing.priceRangeAed[1])}`}
                  comparison={vsAvg(
                    (c.pricing.priceRangeAed[0] + c.pricing.priceRangeAed[1]) / 2,
                    (dubaiAvg.priceRangeMin + dubaiAvg.priceRangeMax) / 2
                  )}
                />
                <StatCard
                  label="YoY Price Change"
                  value={`${c.pricing.priceChangeYoY.min}% – ${c.pricing.priceChangeYoY.max}%`}
                  comparison={vsAvg(thisYoYMid, avgYoYMid)}
                />
                <StatCard
                  label="Transaction Volume (12m)"
                  value={c.pricing.transactionVolume12m}
                  sub="transactions"
                  comparison={vsAvg(
                    (() => { const p = c.pricing.transactionVolume12m.split("-").map(Number); return p.length === 2 ? (p[0] + p[1]) / 2 : p[0] || 0; })(),
                    dubaiAvg.transactionVolume
                  )}
                />
                <StatCard
                  label="Service Charge / sqft"
                  value={`AED ${c.pricing.serviceChargePerSqft.min} – ${c.pricing.serviceChargePerSqft.max}`}
                  comparison={vsAvg(thisScMid, avgScMid, true)}
                />
                <StatCard
                  label="Rental Yield"
                  value={`${c.investment.rentalYieldPct.min}% – ${c.investment.rentalYieldPct.max}%`}
                  comparison={vsAvg(thisYieldMid, avgYieldMid)}
                />
                <StatCard
                  label="Demand Level"
                  value={c.investment.demandLevel.charAt(0).toUpperCase() + c.investment.demandLevel.slice(1)}
                />
                <StatCard
                  label="Capital Appreciation (3y)"
                  value={`${c.investment.capitalAppreciation3y.min}% – ${c.investment.capitalAppreciation3y.max}%`}
                  comparison={vsAvg(thisCapMid, avgCapMid)}
                />
              </div>
            </Section>

            {/* 5. Connectivity */}
            <Section title="Connectivity" id="connectivity" index={4}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Nearest Metro"
                  value={c.connectivity.nearestMetro.name}
                  sub={`${c.connectivity.nearestMetro.distanceKm} km away`}
                  comparison={vsAvg(c.connectivity.nearestMetro.distanceKm, dubaiAvg.metroDistanceKm, true)}
                />
                {c.connectivity.upcomingMetro && (
                  <StatCard
                    label="Upcoming Metro"
                    value={c.connectivity.upcomingMetro.name}
                    sub={`Expected ${c.connectivity.upcomingMetro.expectedYear}`}
                  />
                )}
              </div>

              <h3 className="mt-6 mb-3 text-sm font-medium text-gray-400 uppercase tracking-wide">
                Commute Times
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "DIFC", min: c.connectivity.commuteMinutes.difc, avg: dubaiAvg.commuteDifc },
                  { label: "Business Bay", min: c.connectivity.commuteMinutes.businessBay, avg: dubaiAvg.commuteBusinessBay },
                  { label: "Marina", min: c.connectivity.commuteMinutes.marina, avg: dubaiAvg.commuteMarina },
                  { label: "Airport (DXB)", min: c.connectivity.commuteMinutes.airport, avg: dubaiAvg.commuteAirport },
                ].map((item) => {
                  const comp = vsAvg(item.min, item.avg, true);
                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-center"
                    >
                      <p className="text-2xl font-bold text-white">{item.min}</p>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide">min</p>
                      <p className="mt-1 text-xs text-gray-400">{item.label}</p>
                      <p className={`mt-1 text-[11px] font-medium ${comp.color}`}>{comp.label}</p>
                    </div>
                  );
                })}
              </div>

              <h3 className="mt-6 mb-2 text-sm font-medium text-gray-400 uppercase tracking-wide">
                Walkability
              </h3>
              <div className="flex items-center gap-3">
                <div className="h-3 flex-1 rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-blue-400/50"
                    style={{
                      width: `${(c.connectivity.walkabilityScore / 10) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-white tabular-nums">
                  {c.connectivity.walkabilityScore}/10
                </span>
              </div>
            </Section>

            {/* 6. Livability */}
            <Section title="Livability" id="livability" index={5}>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-2">Nearby Malls</p>
                  <ul className="space-y-1">
                    {c.livability.nearbyMalls.map((m) => (
                      <li key={m} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {m}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-2">Hospitals</p>
                  <ul className="space-y-1">
                    {c.livability.nearbyHospitals.map((h) => (
                      <li key={h} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-2">Supermarkets</p>
                  <ul className="space-y-1">
                    {c.livability.nearbySupermarkets.map((s) => (
                      <li key={s} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-400 mb-2">Parks</p>
                  <ul className="space-y-1">
                    {c.livability.nearbyParks.map((p) => (
                      <li key={p} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Beach Distance"
                  value={`${c.livability.beachDistanceKm} km`}
                  comparison={vsAvg(c.livability.beachDistanceKm, dubaiAvg.beachDistanceKm, true)}
                />
                <StatCard
                  label="Noise Level"
                  value={c.livability.noiseLevel.charAt(0).toUpperCase() + c.livability.noiseLevel.slice(1)}
                />
                <StatCard label="Pet Friendly" value={c.livability.petFriendly ? "Yes ✓" : "No"} />
                <StatCard
                  label="Community Feel"
                  value={c.livability.communityFeel.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                />
              </div>
            </Section>

            {/* 7. Schools & Family */}
            <Section title="Schools & Family" id="schools" index={6}>
              {c.familyFriendliness.schools.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="pb-3 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          School
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          KHDA Rating
                        </th>
                        <th className="pb-3 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Curriculum
                        </th>
                        <th className="pb-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Distance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.familyFriendliness.schools.map((s, i) => (
                        <tr
                          key={s.name}
                          className={i < c.familyFriendliness.schools.length - 1 ? "border-b border-white/[0.05]" : ""}
                        >
                          <td className="py-3 pr-4 text-gray-300">{s.name}</td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                s.rating === "Outstanding" ? "bg-blue-500/10 text-blue-300" :
                                s.rating === "Very Good" ? "bg-white/[0.08] text-gray-200" :
                                s.rating === "Good" ? "bg-white/[0.06] text-gray-400" :
                                "bg-white/[0.04] text-gray-500"
                              }`}
                            >
                              {s.rating}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-400">{s.curriculum}</td>
                          <td className="py-3 text-gray-400">{s.distanceKm} km</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Nearby Nurseries"
                  value={c.familyFriendliness.nearbyNurseries}
                  comparison={vsAvg(c.familyFriendliness.nearbyNurseries, dubaiAvg.nearbyNurseries)}
                />
                <StatCard
                  label="Play Areas"
                  value={c.familyFriendliness.playAreas}
                  comparison={vsAvg(c.familyFriendliness.playAreas, dubaiAvg.playAreas)}
                />
                <StatCard
                  label="Safety Perception"
                  value={c.familyFriendliness.safetyPerception.charAt(0).toUpperCase() + c.familyFriendliness.safetyPerception.slice(1)}
                />
                <StatCard
                  label="Schools Count"
                  value={c.familyFriendliness.schools.length}
                  comparison={vsAvg(c.familyFriendliness.schools.length, dubaiAvg.schoolCount)}
                />
              </div>
            </Section>

            {/* 8. Future Growth */}
            <Section title="Future Growth" id="growth" index={7}>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Dubai 2040 Impact"
                  value={c.futureGrowth.dubai2040Impact.charAt(0).toUpperCase() + c.futureGrowth.dubai2040Impact.slice(1)}
                />
                <div>
                  <p className="text-sm text-gray-400 mb-1">Completion Status</p>
                  <div className="flex items-center gap-3">
                    <div className="h-3 flex-1 rounded-full bg-white/[0.08]">
                      <div
                        className="h-full rounded-full bg-blue-400/50"
                        style={{ width: `${c.futureGrowth.completionStatus * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-white tabular-nums">
                      {Math.round(c.futureGrowth.completionStatus * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {c.futureGrowth.upcomingProjects.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm font-medium text-gray-400 mb-2">Upcoming Projects</p>
                  <ul className="space-y-1">
                    {c.futureGrowth.upcomingProjects.map((p) => (
                      <li key={p} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.futureGrowth.infrastructurePlanned.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-medium text-gray-400 mb-2">
                    Infrastructure Planned
                  </p>
                  <ul className="space-y-1">
                    {c.futureGrowth.infrastructurePlanned.map((p) => (
                      <li key={p} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="text-gray-500">•</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            {/* 9. Similar Communities */}
            <Section title="Similar Communities" id="similar" index={8}>
              <p className="text-sm text-gray-400 mb-4">
                Communities with the closest overall scores to {c.name}
              </p>
              <SimilarCommunities currentId={c.id} allScores={allScores} />
            </Section>

            {/* 10. Download */}
            <Section title="Download Report" id="download" index={9}>
              <div className="flex flex-col items-center gap-4 py-4">
                <button
                  onClick={() => window.print()}
                  className="no-print inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download PDF Report
                </button>
                <p className="text-xs text-gray-600">
                  Data as of {DATA_UPDATED}
                </p>
              </div>
            </Section>
          </div>

          {/* Print-only footer — visible in PDF, hidden on screen */}
          <div className="hidden print:block mt-12 pt-6 border-t border-white/[0.10] text-center">
            <p className="text-sm text-gray-400">
              Source: example.com | Visit example.com for more tools | Data as of {DATA_UPDATED}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
