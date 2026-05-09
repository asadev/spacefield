import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { ProductTourRow } from "../../_types";
import { deleteTour, setStatus, updateTour } from "../_actions";
import StatusChip from "../_components/StatusChip";
import TourForm from "../_components/TourForm";
import TriggerKindChip from "../_components/TriggerKindChip";

export const dynamic = "force-dynamic";

export default async function AdminTourDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_tours")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load tour: {error.message}
      </div>
    );
  }
  const tour = data as ProductTourRow | null;
  if (!tour) notFound();

  const stepCount = Array.isArray(tour.steps) ? tour.steps.length : 0;

  const nextStatus = (
    {
      live: "archived",
      draft: "live",
      archived: "draft",
    } as const
  )[tour.status];
  const flipLabel =
    tour.status === "live"
      ? "Archive"
      : tour.status === "draft"
        ? "Publish (live)"
        : "Move to draft";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tours"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← All tours
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {tour.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {tour.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {tour.id}
              </code>
              <TriggerKindChip kind={tour.trigger_kind} />
              {tour.trigger_route && (
                <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 font-mono text-[10px] text-secondary">
                  {tour.trigger_route}
                </span>
              )}
              <StatusChip status={tour.status} />
              <span className="text-faint">·</span>
              <span>
                {stepCount} step{stepCount === 1 ? "" : "s"}
              </span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(tour.updated_at)}</span>
            </div>
          </div>

          <form action={setStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={tour.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              {flipLabel}
            </button>
          </form>
        </div>
      </div>

      <TourForm mode="edit" action={updateTour} tour={tour} />

      <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <header>
          <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
          <p className="mt-0.5 text-xs text-muted">
            Hard delete removes the row. Archive instead if anything still
            references the id.
          </p>
        </header>
        <form action={deleteTour}>
          <input type="hidden" name="id" value={tour.id} />
          <button
            type="submit"
            className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
          >
            Delete tour
          </button>
        </form>
      </section>
    </div>
  );
}
