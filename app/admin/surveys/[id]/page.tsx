import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../_lib";
import type { SurveyResponseRow, SurveyRow } from "../../_types";
import { SurveyForm } from "../_SurveyForm";
import { setStatus } from "../_actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const HISTOGRAM_BUCKETS = 11; // NPS 0..10 inclusive

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

async function statusAction(formData: FormData): Promise<void> {
  "use server";
  await setStatus(formData);
}

export default async function AdminSurveyDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const admin = createAdminClient();

  // Survey row
  const { data: surveyData } = await admin
    .from("surveys")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const survey = (surveyData as SurveyRow | null) ?? null;
  if (!survey) notFound();

  // Responses (paginated)
  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  const [{ data: respData, count: respCount }, { data: allForStats }] =
    await Promise.all([
      admin
        .from("survey_responses")
        .select(
          "id, survey_id, user_id, workspace_id, answers, nps_score, rating, comments, metadata, created_at",
          { count: "exact" }
        )
        .eq("survey_id", id)
        .order("created_at", { ascending: false })
        .range(from, to),
      // Pull a wider slice for stats (capped at 5k to keep this page fast).
      admin
        .from("survey_responses")
        .select("nps_score, rating")
        .eq("survey_id", id)
        .limit(5000),
    ]);

  const responses = (respData ?? []) as SurveyResponseRow[];
  const total = respCount ?? responses.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Resolve user emails for the visible page only.
  const userIds = Array.from(
    new Set(responses.map((r) => r.user_id).filter((x): x is string => !!x))
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  const statsRows = (allForStats ?? []) as Array<{
    nps_score: number | null;
    rating: number | null;
  }>;

  const stats = computeStats(statsRows);
  const targetSize = readNumber(survey.audience_config?.target_size);
  const responseRate =
    targetSize && targetSize > 0 ? total / targetSize : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/surveys"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All surveys
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {survey.display_name}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
              {survey.id}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Created {formatDateTime(survey.created_at)} · last updated{" "}
              {formatDateTime(survey.updated_at)}
            </p>
          </div>
          <StatusToggle current={survey.status} id={survey.id} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Responses" value={total.toLocaleString()} />
        <StatCard
          label="Avg NPS"
          value={stats.npsCount > 0 ? stats.npsScore.toFixed(0) : "—"}
          subtitle={
            stats.npsCount > 0
              ? `${stats.promoterPct}% prom · ${stats.passivePct}% pas · ${stats.detractorPct}% det`
              : "no NPS responses"
          }
        />
        <StatCard
          label="Avg rating"
          value={
            stats.ratingCount > 0 ? stats.avgRating.toFixed(2) : "—"
          }
          subtitle={
            stats.ratingCount > 0 ? `${stats.ratingCount} ratings` : "no ratings"
          }
        />
        <StatCard
          label="Response rate"
          value={
            responseRate != null
              ? `${(responseRate * 100).toFixed(1)}%`
              : "—"
          }
          subtitle={
            targetSize
              ? `${total.toLocaleString()} / ${targetSize.toLocaleString()}`
              : "set audience_config.target_size"
          }
        />
        <StatCard
          label="Status"
          value={survey.status}
          subtitle={`Trigger: ${survey.trigger_kind}`}
        />
      </div>

      {/* NPS histogram */}
      <NpsHistogram counts={stats.npsHistogram} total={stats.npsCount} />

      {/* Edit form */}
      <div className="rounded-xl border border-app bg-app-elevated">
        <div className="border-b border-app px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          Edit
        </div>
        <div className="p-1">
          <SurveyForm mode="edit" survey={survey} />
        </div>
      </div>

      {/* Responses table */}
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold text-app">Responses</h2>
            <p className="text-[11px] text-muted">
              Newest first. {total.toLocaleString()} total · page {page} of{" "}
              {totalPages}.
            </p>
          </div>
          <Pagination id={id} page={page} totalPages={totalPages} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">NPS</th>
                <th className="px-3 py-2 text-left font-normal">Rating</th>
                <th className="px-3 py-2 text-left font-normal">Comments</th>
                <th className="px-3 py-2 text-right font-normal">View</th>
              </tr>
            </thead>
            <tbody>
              {responses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-faint">
                    No responses yet.
                  </td>
                </tr>
              ) : (
                responses.map((r) => {
                  const u = r.user_id ? userMap.get(r.user_id) : null;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-app last:border-b-0 hover:bg-app/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary">
                        {u?.email ?? r.user_id ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <NpsCell score={r.nps_score} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-app">
                        {r.rating != null ? `${r.rating}/5` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary">
                        <span className="line-clamp-1 break-all">
                          {r.comments ? excerpt(r.comments, 100) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/surveys/${encodeURIComponent(id)}/responses/${r.id}`}
                          className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function readNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function excerpt(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function computeStats(rows: Array<{ nps_score: number | null; rating: number | null }>) {
  const histogram = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  let promoter = 0;
  let passive = 0;
  let detractor = 0;
  let npsCount = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const r of rows) {
    const n = r.nps_score;
    if (typeof n === "number" && n >= 0 && n <= 10) {
      histogram[n] += 1;
      npsCount += 1;
      if (n >= 9) promoter += 1;
      else if (n >= 7) passive += 1;
      else detractor += 1;
    }
    const rt = r.rating;
    if (typeof rt === "number" && rt >= 1 && rt <= 5) {
      ratingSum += rt;
      ratingCount += 1;
    }
  }

  const promoterPct = npsCount > 0 ? Math.round((promoter / npsCount) * 100) : 0;
  const passivePct = npsCount > 0 ? Math.round((passive / npsCount) * 100) : 0;
  const detractorPct =
    npsCount > 0 ? Math.round((detractor / npsCount) * 100) : 0;
  const npsScore = promoterPct - detractorPct; // -100..100
  const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

  return {
    npsHistogram: histogram,
    npsCount,
    promoter,
    passive,
    detractor,
    promoterPct,
    passivePct,
    detractorPct,
    npsScore,
    ratingSum,
    ratingCount,
    avgRating,
  };
}

/* ─────────────────────────── components ─────────────────────────── */

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-app">
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-[10px] text-faint">{subtitle}</div>
      )}
    </div>
  );
}

function NpsCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-faint">—</span>;
  let cls = "bg-app-elevated text-secondary border border-app";
  if (score >= 9) cls = "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
  else if (score >= 7)
    cls = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  else cls = "bg-rose-500/15 text-rose-500";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold tabular-nums ${cls}`}
    >
      {score}
    </span>
  );
}

function StatusToggle({
  current,
  id,
}: {
  current: SurveyRow["status"];
  id: string;
}) {
  const next: Record<SurveyRow["status"], SurveyRow["status"]> = {
    live: "draft",
    draft: "live",
    archived: "draft",
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["live", "draft", "archived"] as const).map((s) => {
        const active = s === current;
        return (
          <form key={s} action={statusAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={s} />
            <button
              type="submit"
              disabled={active}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors ${
                active
                  ? "border-tool-accent bg-tool-accent text-white"
                  : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
              }`}
            >
              {s}
            </button>
          </form>
        );
      })}
      {/* Hint: clicking the alternate button uses next[] mapping logically;
       *  but here we let the user pick any state explicitly. */}
      <span className="sr-only">{next[current]}</span>
    </div>
  );
}

function NpsHistogram({
  counts,
  total,
}: {
  counts: number[];
  total: number;
}) {
  const max = counts.reduce((m, v) => Math.max(m, v), 0);
  const W = 700;
  const H = 180;
  const padX = 32;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const bw = innerW / counts.length;

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            NPS distribution
          </div>
          <div className="text-sm font-semibold text-app">
            {total.toLocaleString()} responses
          </div>
        </div>
        <div className="text-[10px] text-faint">
          0–6 detractors · 7–8 passives · 9–10 promoters
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-40 w-full"
        role="img"
        aria-label="NPS distribution histogram"
      >
        {/* Baseline */}
        <line
          x1={padX}
          x2={W - padX}
          y1={H - padY}
          y2={H - padY}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        {counts.map((c, i) => {
          const h = max > 0 ? (c / max) * innerH : 0;
          const x = padX + i * bw + bw * 0.15;
          const y = H - padY - h;
          const w = bw * 0.7;
          const fill =
            i <= 6
              ? "rgb(244 63 94 / 0.85)" // rose-500
              : i <= 8
                ? "rgb(245 158 11 / 0.85)" // amber-500
                : "rgb(16 185 129 / 0.85)"; // emerald-500
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={fill}
                rx={3}
              />
              <text
                x={x + w / 2}
                y={H - padY + 12}
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.6}
                textAnchor="middle"
              >
                {i}
              </text>
              {c > 0 && (
                <text
                  x={x + w / 2}
                  y={Math.max(padY + 8, y - 4)}
                  fontSize={9}
                  fill="currentColor"
                  fillOpacity={0.85}
                  textAnchor="middle"
                >
                  {c}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Pagination({
  id,
  page,
  totalPages,
}: {
  id: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const base = `/admin/surveys/${encodeURIComponent(id)}`;
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`${base}?page=${prev}`}
        aria-disabled={page === 1}
        className={`rounded-md border border-app bg-app px-2.5 py-1 text-[11px] transition-colors ${
          page === 1
            ? "pointer-events-none text-faint"
            : "text-secondary hover:border-tool-accent hover:text-app"
        }`}
      >
        ← Prev
      </Link>
      <span className="text-[11px] tabular-nums text-faint">
        {page} / {totalPages}
      </span>
      <Link
        href={`${base}?page=${next}`}
        aria-disabled={page === totalPages}
        className={`rounded-md border border-app bg-app px-2.5 py-1 text-[11px] transition-colors ${
          page === totalPages
            ? "pointer-events-none text-faint"
            : "text-secondary hover:border-tool-accent hover:text-app"
        }`}
      >
        Next →
      </Link>
    </div>
  );
}
