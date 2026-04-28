"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * PipelineView — kanban board for the workspace's deals, grouped by
 * stage. Drag/drop across columns to move; drag inside a column to reorder.
 * Every state mutation flows through /api/crm/deals/move. Optimistic UI:
 * we update the local state immediately, fire the request, and revert on
 * failure with a toast.
 *
 * Composition
 * ───────────
 *   PipelineView
 *     ├─ top bar  (pipeline picker · filters · search · + new deal)
 *     ├─ board    (one Column per stage)
 *     │    └─ Column  (header · DealCard list · empty + add)
 *     ├─ DealDialog        (quick add)
 *     ├─ PipelineSettings  (admin-only)
 *     └─ DealDetail        (slide-over)
 *
 * Mobile: stacks the kanban as a single column with stage tabs above.
 * ───────────────────────────────────────────────────────────────────── */

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import type {
  CrmCompany,
  CrmContact,
  CrmDeal,
  CrmPipelineStage,
  CrmPipelineWithStages,
} from "../types";
import DealCard from "./_kanban/DealCard";
import DealDetail from "./DealDetail";
import DealDialog from "./_kanban/DealDialog";
import PipelineSettings from "./PipelineSettings";
import {
  bucketDeals,
  formatCompactCurrency,
  positionForInsert,
  sumAmount,
} from "./_kanban/helpers";
import {
  Button,
  Icon,
  Select,
  TextInput,
  ToastHost,
  useToast,
} from "./_kanban/ui";

interface PipelineViewProps {
  width: number;
  search: string;
  onSearchChange: (v: string) => void;
}

type FilterChip = "all" | "mine" | "stale";

export default function PipelineView(props: PipelineViewProps) {
  return (
    <ToastHost>
      <PipelineViewInner {...props} />
    </ToastHost>
  );
}

function PipelineViewInner({ width, search, onSearchChange }: PipelineViewProps) {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const role = current.kind === "team" ? current.role : null;
  const isAdmin = role === "owner" || role === "admin";
  const toast = useToast();

  const [pipelines, setPipelines] = useState<CrmPipelineWithStages[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [contactsById, setContactsById] = useState<Map<string, CrmContact>>(new Map());
  const [companiesById, setCompaniesById] = useState<Map<string, CrmCompany>>(new Map());
  const [loading, setLoading] = useState(false);
  const [chip, setChip] = useState<FilterChip>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStageId, setDialogStageId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mobileStageIdx, setMobileStageIdx] = useState(0);
  const compact = width < 720;

  const userIdRef = useRef<string | null>(null);

  // Resolve the current user once for "My deals" filter.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) userIdRef.current = data.user?.id ?? null;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load pipelines on workspace change.
  useEffect(() => {
    if (!workspaceId) {
      setPipelines([]);
      setActivePipelineId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const json = await cachedFetch<{ items: CrmPipelineWithStages[] }>(
          `/api/crm/pipelines?workspace_id=${workspaceId}`
        );
        if (cancelled) return;
        setPipelines(json.items);
        const def =
          json.items.find((p) => p.is_default) ?? json.items[0] ?? null;
        if (def) setActivePipelineId(def.id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === activePipelineId) ?? null,
    [pipelines, activePipelineId]
  );

  const stages = activePipeline?.stages ?? [];

  // Load deals + relations whenever the active pipeline changes.
  const loadDeals = useCallback(async () => {
    if (!workspaceId || !activePipelineId) {
      setDeals([]);
      return;
    }
    setLoading(true);
    try {
      const json = await cachedFetch<{ items: CrmDeal[] }>(
        `/api/crm/deals?workspace_id=${workspaceId}&pipeline_id=${activePipelineId}&limit=500`
      );
      setDeals(json.items);

      // Hydrate contacts + companies referenced by these deals.
      const contactIds = new Set<string>();
      const companyIds = new Set<string>();
      for (const d of json.items) {
        if (d.primary_contact_id) contactIds.add(d.primary_contact_id);
        if (d.company_id) companyIds.add(d.company_id);
      }

      const [contactsMap, companiesMap] = await Promise.all([
        contactIds.size > 0
          ? cachedFetch<{ items: CrmContact[] }>(
              `/api/crm/contacts?workspace_id=${workspaceId}&limit=500`
            )
              .then((j) => {
                const m = new Map<string, CrmContact>();
                for (const c of j.items) if (contactIds.has(c.id)) m.set(c.id, c);
                return m;
              })
              .catch(() => new Map<string, CrmContact>())
          : Promise.resolve(new Map<string, CrmContact>()),
        companyIds.size > 0
          ? cachedFetch<{ items: CrmCompany[] }>(
              `/api/crm/companies?workspace_id=${workspaceId}&limit=500`
            )
              .then((j) => {
                const m = new Map<string, CrmCompany>();
                for (const c of j.items) if (companyIds.has(c.id)) m.set(c.id, c);
                return m;
              })
              .catch(() => new Map<string, CrmCompany>())
          : Promise.resolve(new Map<string, CrmCompany>()),
      ]);
      setContactsById(contactsMap);
      setCompaniesById(companiesMap);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activePipelineId, toast]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.metaKey && e.key.toLowerCase() === "n" && !inField) {
        e.preventDefault();
        setDialogStageId(stages[0]?.id ?? null);
        setDialogOpen(true);
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>(
          'input[data-pipeline-search="true"]'
        );
        el?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stages]);

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (chip === "mine") {
      const me = userIdRef.current;
      if (!me) return [];
      list = list.filter(
        (d) => d.owner_id === me || d.assignee_ids.includes(me)
      );
    } else if (chip === "stale") {
      const stagesById = new Map(stages.map((s) => [s.id, s]));
      list = list.filter((d) => {
        const s = stagesById.get(d.stage_id);
        if (!s || s.kind !== "open" || !s.rot_days) return false;
        const ageDays =
          (Date.now() - new Date(d.updated_at).getTime()) /
          (24 * 60 * 60 * 1000);
        return ageDays >= s.rot_days;
      });
    }
    return list;
  }, [deals, search, chip, stages]);

  const buckets = useMemo(
    () => bucketDeals(filteredDeals, stages),
    [filteredDeals, stages]
  );

  const dealsById = useMemo(() => {
    const m = new Map<string, CrmDeal>();
    for (const d of deals) m.set(d.id, d);
    return m;
  }, [deals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = (e: DragStartEvent) => {
    setDraggingId(String(e.active.id));
  };

  const onDragOver = (_e: DragOverEvent) => {
    /* dnd-kit handles the visual reorder; persistence happens on drop. */
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = e;
    if (!over || active.id === over.id && (over.data.current as { type?: string } | undefined)?.type !== "stage") {
      return;
    }
    const dealId = String(active.id);
    const moving = dealsById.get(dealId);
    if (!moving) return;

    // Determine destination stage + index.
    let destStageId = moving.stage_id;
    let destIndex = -1;

    const overData = over.data.current as
      | { type: "deal"; deal: CrmDeal }
      | { type: "stage"; stageId: string }
      | undefined;

    if (overData?.type === "stage") {
      destStageId = overData.stageId;
      destIndex = (buckets.get(destStageId)?.length ?? 0); // append
    } else if (overData?.type === "deal") {
      destStageId = overData.deal.stage_id;
      const arr = buckets.get(destStageId) ?? [];
      const idx = arr.findIndex((d) => d.id === overData.deal.id);
      // If we're dropping on a card that's after our current position in the
      // same column, dnd-kit treats it as "after"; otherwise "before".
      const fromIdx = arr.findIndex((d) => d.id === dealId);
      destIndex = fromIdx === -1 || fromIdx > idx ? idx : idx + 1;
    } else {
      return;
    }

    // Build the new bucket arrangement and compute optimistic position.
    const targetBucket = (buckets.get(destStageId) ?? []).filter(
      (d) => d.id !== dealId
    );
    const insertAt = Math.max(0, Math.min(destIndex, targetBucket.length));
    const newPosition = positionForInsert(targetBucket, insertAt);

    if (
      moving.stage_id === destStageId &&
      moving.position === newPosition
    ) {
      return;
    }

    // Optimistic update.
    const prevDeals = deals;
    setDeals((cur) =>
      cur.map((d) =>
        d.id === dealId
          ? { ...d, stage_id: destStageId, position: newPosition }
          : d
      )
    );

    try {
      const res = await fetch("/api/crm/deals/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dealId,
          stage_id: destStageId,
          position: newPosition,
        }),
      });
      if (!res.ok) throw new Error("move failed");
      const json = (await res.json()) as { item: CrmDeal };
      setDeals((cur) => cur.map((d) => (d.id === dealId ? json.item : d)));
      // Bust the deals list cache so the next pipeline-revisit shows
      // the moved card in its new stage instead of the cached snapshot.
      invalidate({ prefix: `/api/crm/deals?workspace_id=${workspaceId}` });
    } catch (err) {
      setDeals(prevDeals);
      toast.push("error", (err as Error).message);
    }
  };

  const handleQuickAdd = (stageId: string) => {
    setDialogStageId(stageId);
    setDialogOpen(true);
  };

  const handleCreated = (deal: CrmDeal) => {
    setDeals((cur) => [...cur, deal]);
    invalidate({ prefix: `/api/crm/deals?workspace_id=${workspaceId}` });
  };

  const handleDealUpdated = (deal: CrmDeal) => {
    setDeals((cur) => cur.map((d) => (d.id === deal.id ? deal : d)));
  };

  const handleDealDeleted = (id: string) => {
    setDeals((cur) => cur.filter((d) => d.id !== id));
    setActiveDealId(null);
  };

  const refreshPipelines = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/crm/pipelines?workspace_id=${workspaceId}`);
    if (!res.ok) return;
    const json = (await res.json()) as { items: CrmPipelineWithStages[] };
    setPipelines(json.items);
    if (activePipelineId && !json.items.some((p) => p.id === activePipelineId)) {
      setActivePipelineId(json.items[0]?.id ?? null);
    }
  }, [workspaceId, activePipelineId]);

  // ── render ────────────────────────────────────────────────────────────

  if (!signedIn) {
    return (
      <EmptyPane
        title="Sign in to use the CRM"
        body="The CRM is workspace-scoped. Sign in and pick a team workspace to load your pipeline."
      />
    );
  }
  if (!workspaceId) {
    return (
      <EmptyPane
        title="Pick a team workspace"
        body="Personal workspaces don't sync to the CRM. Switch to a team workspace from the desktop's workspace switcher."
      />
    );
  }
  if (pipelines.length === 0 && !loading) {
    return (
      <EmptyPane
        title="No pipeline yet"
        body="Your workspace doesn't have a pipeline configured. Run the CRM foundation migration or create one in Settings."
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-app text-app">
      {/* ── top bar ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
        <div className="flex items-center gap-1">
          <Select
            value={activePipelineId ?? ""}
            onChange={(e) => setActivePipelineId(e.target.value)}
            className="min-w-[160px]"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_default ? " · default" : ""}
              </option>
            ))}
          </Select>
          {isAdmin && (
            <button
              type="button"
              aria-label="Pipeline settings"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-surface hover:text-app"
            >
              <Icon name="gear" size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {(["all", "mine", "stale"] as FilterChip[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChip(c)}
              className={`rounded-md border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] transition-colors ${
                chip === c
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app bg-app-elevated text-secondary hover:text-app"
              }`}
            >
              {c === "all" ? "All deals" : c === "mine" ? "My deals" : "Stale"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden md:block">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint">
              <Icon name="search" size={12} />
            </span>
            <TextInput
              data-pipeline-search="true"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search deals…"
              className="pl-7"
              style={{ width: 220 }}
            />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setDialogStageId(stages[0]?.id ?? null);
              setDialogOpen(true);
            }}
          >
            <Icon name="plus" size={12} />
            New deal
          </Button>
        </div>
      </div>

      {/* ── board ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {compact ? (
          <MobileBoard
            stages={stages}
            buckets={buckets}
            mobileStageIdx={mobileStageIdx}
            setMobileStageIdx={setMobileStageIdx}
            contactsById={contactsById}
            companiesById={companiesById}
            onOpen={(d) => setActiveDealId(d.id)}
            onQuickAdd={handleQuickAdd}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-3 overflow-x-auto p-3">
              {stages.map((stage) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  deals={buckets.get(stage.id) ?? []}
                  contactsById={contactsById}
                  companiesById={companiesById}
                  onOpen={(d) => setActiveDealId(d.id)}
                  onQuickAdd={() => handleQuickAdd(stage.id)}
                />
              ))}
              {stages.length === 0 && (
                <div className="m-auto text-sm text-muted">
                  This pipeline has no stages yet.{" "}
                  {isAdmin && "Open settings to add some."}
                </div>
              )}
            </div>
            <DragOverlay>
              {draggingId &&
                (() => {
                  const d = dealsById.get(draggingId);
                  if (!d) return null;
                  const s = stages.find((st) => st.id === d.stage_id);
                  return (
                    <div style={{ width: 280 }}>
                      <DealCard
                        deal={d}
                        stage={s}
                        contactsById={contactsById}
                        companiesById={companiesById}
                        onOpen={() => {}}
                        dragging
                      />
                    </div>
                  );
                })()}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── dialogs ───────────────────────────────────────────────────── */}
      {dialogOpen && activePipeline && (
        <DealDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          workspaceId={workspaceId}
          pipelineId={activePipeline.id}
          stages={activePipeline.stages}
          defaultStageId={dialogStageId ?? undefined}
          onCreated={handleCreated}
        />
      )}
      {settingsOpen && (
        <PipelineSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          workspaceId={workspaceId}
          pipelines={pipelines}
          activePipelineId={activePipelineId}
          onChanged={refreshPipelines}
          isAdmin={isAdmin}
        />
      )}
      {activeDealId && (
        <DealDetail
          dealId={activeDealId}
          workspaceId={workspaceId}
          pipelines={pipelines}
          isAdmin={isAdmin}
          onClose={() => setActiveDealId(null)}
          onChanged={handleDealUpdated}
          onDeleted={handleDealDeleted}
          width={width}
        />
      )}
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────

function Column({
  stage,
  deals,
  contactsById,
  companiesById,
  onOpen,
  onQuickAdd,
}: {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  contactsById: Map<string, CrmContact>;
  companiesById: Map<string, CrmCompany>;
  onOpen: (d: CrmDeal) => void;
  onQuickAdd: () => void;
}) {
  const droppable = useDroppable({
    id: `stage:${stage.id}`,
    data: { type: "stage", stageId: stage.id },
  });
  const total = sumAmount(deals);
  const dealIds = useMemo(() => deals.map((d) => d.id), [deals]);

  const accent = stage.color ?? undefined;
  const headerColor =
    stage.kind === "won"
      ? "var(--tool-accent)"
      : stage.kind === "lost"
      ? "rgb(239 68 68)"
      : accent ?? "var(--text-secondary)";

  return (
    <div
      className="flex h-full w-[300px] shrink-0 flex-col rounded-lg border border-app bg-app"
      ref={droppable.setNodeRef}
    >
      <div className="flex items-center justify-between gap-2 border-b border-app px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: headerColor }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-app">{stage.name}</span>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            {deals.length}
          </span>
        </div>
        <span className="font-mono text-[0.65rem] tabular-nums text-secondary">
          {total > 0 ? formatCompactCurrency(total) : "—"}
        </span>
      </div>
      <div
        className={`flex-1 space-y-2 overflow-y-auto p-2 ${
          droppable.isOver ? "bg-tool-accent-soft" : ""
        }`}
      >
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {deals.map((d) => (
            <DealCard
              key={d.id}
              deal={d}
              stage={stage}
              contactsById={contactsById}
              companiesById={companiesById}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-app text-xs text-faint">
            Drop deals here
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onQuickAdd}
        className="flex items-center justify-center gap-1 border-t border-app px-3 py-2 text-xs text-secondary hover:bg-surface hover:text-app"
      >
        <Icon name="plus" size={12} />
        New
      </button>
    </div>
  );
}

// ── MobileBoard ────────────────────────────────────────────────────────

function MobileBoard({
  stages,
  buckets,
  mobileStageIdx,
  setMobileStageIdx,
  contactsById,
  companiesById,
  onOpen,
  onQuickAdd,
}: {
  stages: CrmPipelineStage[];
  buckets: Map<string, CrmDeal[]>;
  mobileStageIdx: number;
  setMobileStageIdx: (n: number) => void;
  contactsById: Map<string, CrmContact>;
  companiesById: Map<string, CrmCompany>;
  onOpen: (d: CrmDeal) => void;
  onQuickAdd: (stageId: string) => void;
}) {
  if (stages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No stages.
      </div>
    );
  }
  const idx = Math.min(mobileStageIdx, stages.length - 1);
  const stage = stages[idx];
  const deals = buckets.get(stage.id) ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-app bg-app-elevated px-2 py-2">
        {stages.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setMobileStageIdx(i)}
            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${
              i === idx
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app text-secondary"
            }`}
          >
            {s.name}
            <span className="ml-1.5 text-faint">
              {(buckets.get(s.id) ?? []).length}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {deals.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-app text-xs text-faint">
            No deals in {stage.name}
          </div>
        )}
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            stage={stage}
            contactsById={contactsById}
            companiesById={companiesById}
            onOpen={onOpen}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onQuickAdd(stage.id)}
        className="flex items-center justify-center gap-1 border-t border-app px-3 py-2 text-xs text-secondary hover:bg-surface hover:text-app"
      >
        <Icon name="plus" size={12} />
        New deal in {stage.name}
      </button>
    </div>
  );
}

// ── EmptyPane ──────────────────────────────────────────────────────────

function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-xl border border-app bg-app-elevated p-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.pipeline
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">{title}</h2>
        <p className="mt-2 text-sm text-secondary">{body}</p>
      </div>
    </div>
  );
}
