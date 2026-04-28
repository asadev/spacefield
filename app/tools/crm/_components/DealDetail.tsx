"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * DealDetail — right-edge slide-over panel for a single deal.
 *
 * Tabs
 *   Overview → contact, company, owner, assignees, visibility, tags,
 *              created/updated dates. Inline-editable for owners/admins.
 *   Activity → chronological feed of crm_activities scoped to deal_id;
 *              quick "Log note" form at the top.
 *   Files    → workspace_files attached via deal.custom.attachments[].
 *              v1: shows the array as a list; paperclip add wires to
 *              /api/files/save-content if the host has it.
 *   Custom   → read-only render of all crm_custom_fields for record_type
 *              "deal" using the renderCustomValue helper.
 *
 * Footer "Won" / "Lost" buttons advance the deal to a terminal stage.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CrmActivity,
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmDeal,
  CrmPipelineStage,
  CrmPipelineWithStages,
  CrmTag,
  CrmVisibility,
} from "../types";
import {
  Avatar,
  Button,
  Icon,
  NumberInput,
  Select,
  SlideOver,
  StagePill,
  TextArea,
  useToast,
} from "./_kanban/ui";
import {
  formatCloseDate,
  formatDealAmount,
} from "./_kanban/helpers";
import {
  contactDisplayName,
  relativeTime,
  renderCustomValue,
} from "./_records/helpers";

interface DealDetailProps {
  dealId: string;
  workspaceId: string;
  pipelines: CrmPipelineWithStages[];
  isAdmin: boolean;
  width: number;
  onClose: () => void;
  onChanged: (deal: CrmDeal) => void;
  onDeleted: (id: string) => void;
}

interface HydratedDeal extends CrmDeal {
  company: CrmCompany | null;
  primary_contact: CrmContact | null;
  stage: CrmPipelineStage | null;
  tags: CrmTag[];
}

type Tab = "overview" | "activity" | "files" | "custom";

export default function DealDetail({
  dealId,
  workspaceId,
  pipelines,
  isAdmin,
  width,
  onClose,
  onChanged,
  onDeleted,
}: DealDetailProps) {
  const toast = useToast();
  const [deal, setDeal] = useState<HydratedDeal | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const fullScreen = width < 720;

  // Combine all stages across pipelines for the move dropdown.
  const allStages = useMemo<{ pipeline: CrmPipelineWithStages; stage: CrmPipelineStage }[]>(
    () =>
      pipelines.flatMap((p) =>
        p.stages.map((s) => ({ pipeline: p, stage: s }))
      ),
    [pipelines]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`);
      if (!res.ok) throw new Error("failed to load deal");
      const json = (await res.json()) as { item: HydratedDeal };
      setDeal(json.item);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dealId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDeal = async (
    patch: Partial<CrmDeal>
  ): Promise<HydratedDeal | null> => {
    if (!deal) return null;
    const prev = deal;
    setDeal({ ...deal, ...patch });
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "patch failed");
      }
      const json = (await res.json()) as { item: CrmDeal };
      const next: HydratedDeal = { ...prev, ...json.item };
      setDeal(next);
      onChanged(json.item);
      return next;
    } catch (err) {
      setDeal(prev);
      toast.push("error", (err as Error).message);
      return null;
    }
  };

  const moveStage = async (stageId: string) => {
    if (!deal) return;
    try {
      const res = await fetch("/api/crm/deals/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deal.id,
          stage_id: stageId,
          position: deal.position,
        }),
      });
      if (!res.ok) throw new Error("move failed");
      const json = (await res.json()) as { item: CrmDeal };
      setDeal({ ...deal, ...json.item });
      onChanged(json.item);
      // Re-fetch hydrated stage info.
      void load();
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deal) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${deal.name}"? This can't be undone.`)
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onDeleted(dealId);
      toast.push("success", "Deal deleted");
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const markAs = async (kind: "won" | "lost") => {
    if (!deal) return;
    // Find the first terminal stage matching the kind in this pipeline.
    const pipe = pipelines.find((p) => p.id === deal.pipeline_id);
    const terminal = pipe?.stages.find((s) => s.kind === kind);
    if (!terminal) {
      toast.push("error", `No ${kind} stage exists in this pipeline`);
      return;
    }
    await moveStage(terminal.id);
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      width={520}
      fullScreen={fullScreen}
    >
      {loading || !deal ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          Loading deal…
        </div>
      ) : (
        <DealDetailBody
          deal={deal}
          workspaceId={workspaceId}
          allStages={allStages}
          isAdmin={isAdmin}
          tab={tab}
          setTab={setTab}
          onClose={onClose}
          patchDeal={patchDeal}
          moveStage={moveStage}
          onDelete={handleDelete}
          markAs={markAs}
        />
      )}
    </SlideOver>
  );
}

// ── Body ───────────────────────────────────────────────────────────────

function DealDetailBody({
  deal,
  workspaceId,
  allStages,
  isAdmin,
  tab,
  setTab,
  onClose,
  patchDeal,
  moveStage,
  onDelete,
  markAs,
}: {
  deal: {
    id: string;
    workspace_id: string;
    pipeline_id: string;
    stage_id: string;
    name: string;
    amount: number | null;
    currency: string;
    close_date: string | null;
    primary_contact_id: string | null;
    company_id: string | null;
    assignee_ids: string[];
    visibility: CrmVisibility;
    owner_id: string | null;
    status: "open" | "won" | "lost";
    custom: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    company: CrmCompany | null;
    primary_contact: CrmContact | null;
    stage: CrmPipelineStage | null;
    tags: CrmTag[];
  };
  workspaceId: string;
  allStages: { pipeline: CrmPipelineWithStages; stage: CrmPipelineStage }[];
  isAdmin: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  patchDeal: (patch: Partial<CrmDeal>) => Promise<unknown>;
  moveStage: (stageId: string) => Promise<void>;
  onDelete: () => void;
  markAs: (kind: "won" | "lost") => void;
}) {
  const [name, setName] = useState(deal.name);
  const [amount, setAmount] = useState<string>(
    deal.amount === null ? "" : String(deal.amount)
  );
  const [closeDate, setCloseDate] = useState(deal.close_date ?? "");

  // Reset locals when the deal id changes.
  useEffect(() => {
    setName(deal.name);
    setAmount(deal.amount === null ? "" : String(deal.amount));
    setCloseDate(deal.close_date ?? "");
  }, [deal.id, deal.name, deal.amount, deal.close_date]);

  const stage = deal.stage;

  return (
    <>
      {/* Header */}
      <div className="border-b border-app p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== deal.name) {
                  void patchDeal({ name: name.trim() });
                }
              }}
              className="w-full bg-transparent text-lg font-semibold text-app focus:outline-none"
            />
            {stage && (
              <div className="mt-2 flex items-center gap-2">
                <StagePill
                  name={stage.name}
                  color={stage.color}
                  kind={stage.kind}
                />
                <select
                  value={deal.stage_id}
                  onChange={(e) => moveStage(e.target.value)}
                  className="rounded-md border border-app bg-app px-2 py-0.5 text-xs text-secondary"
                  aria-label="Move to stage"
                >
                  {allStages.map(({ pipeline, stage: s }) => (
                    <option key={s.id} value={s.id}>
                      {pipeline.name === stage.name ? "" : `${pipeline.name} · `}
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary hover:bg-surface hover:text-app"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Amount
            </div>
            <div className="mt-1 flex items-center gap-1">
              <NumberInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => {
                  const n = amount === "" ? null : Number(amount);
                  if (n !== deal.amount) void patchDeal({ amount: n });
                }}
                className="text-base"
                step="0.01"
              />
              <span className="font-mono text-xs text-secondary">
                {deal.currency}
              </span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              Close date
            </div>
            <input
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              onBlur={() => {
                if (closeDate !== (deal.close_date ?? "")) {
                  void patchDeal({ close_date: closeDate || null });
                }
              }}
              className="mt-1 w-full rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
            />
            <div className="mt-1 text-[0.65rem] text-muted">
              {formatCloseDate(deal.close_date)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-app px-3 py-1">
        {(["overview", "activity", "files", "custom"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] ${
              tab === t
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:bg-surface"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "overview" && (
          <OverviewTab
            deal={deal}
            isAdmin={isAdmin}
            patchDeal={patchDeal}
          />
        )}
        {tab === "activity" && (
          <ActivityTab dealId={deal.id} workspaceId={workspaceId} />
        )}
        {tab === "files" && <FilesTab deal={deal} patchDeal={patchDeal} />}
        {tab === "custom" && (
          <CustomTab workspaceId={workspaceId} custom={deal.custom} />
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-app bg-app px-4 py-3">
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Icon name="trash" size={12} />
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => markAs("lost")}>
            Mark lost
          </Button>
          <Button variant="primary" size="sm" onClick={() => markAs("won")}>
            Mark won
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Overview ───────────────────────────────────────────────────────────

function OverviewTab({
  deal,
  isAdmin,
  patchDeal,
}: {
  deal: {
    id: string;
    primary_contact: CrmContact | null;
    company: CrmCompany | null;
    visibility: CrmVisibility;
    owner_id: string | null;
    assignee_ids: string[];
    created_at: string;
    updated_at: string;
    tags: CrmTag[];
  };
  isAdmin: boolean;
  patchDeal: (patch: Partial<CrmDeal>) => Promise<unknown>;
}) {
  // Provide read-only display + a visibility editor (the most useful inline edit).
  return (
    <div className="space-y-4">
      <Section label="Primary contact">
        {deal.primary_contact ? (
          <div className="flex items-center gap-2">
            <Avatar
              label={contactDisplayName(deal.primary_contact)}
              size={24}
            />
            <div className="flex flex-col">
              <span className="text-sm text-app">
                {contactDisplayName(deal.primary_contact)}
              </span>
              {deal.primary_contact.email && (
                <span className="text-xs text-muted">
                  {deal.primary_contact.email}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </Section>

      <Section label="Company">
        {deal.company ? (
          <span className="text-sm text-app">{deal.company.name}</span>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </Section>

      <Section label="Owner">
        <span className="font-mono text-[0.7rem] text-secondary">
          {deal.owner_id ? deal.owner_id.slice(0, 8) : "—"}
        </span>
      </Section>

      <Section label="Assignees">
        {deal.assignee_ids.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {deal.assignee_ids.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[0.65rem] text-secondary"
              >
                <Avatar label={id.slice(0, 2)} size={16} />
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted">No assignees</span>
        )}
      </Section>

      <Section label="Visibility">
        {isAdmin ? (
          <Select
            value={deal.visibility}
            onChange={(e) =>
              patchDeal({ visibility: e.target.value as CrmVisibility })
            }
            className="max-w-[200px]"
          >
            <option value="public">Public</option>
            <option value="team">Team</option>
            <option value="assigned">Assigned</option>
            <option value="owner">Owner</option>
          </Select>
        ) : (
          <span className="text-sm text-app">{deal.visibility}</span>
        )}
      </Section>

      <Section label="Tags">
        {deal.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {deal.tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app px-2 py-0.5 text-[0.65rem]"
                style={{ color: t.color }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: t.color }}
                />
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted">No tags</span>
        )}
      </Section>

      <Section label="Created">
        <span className="text-sm text-secondary">
          {relativeTime(deal.created_at)}
        </span>
      </Section>
      <Section label="Updated">
        <span className="text-sm text-secondary">
          {relativeTime(deal.updated_at)}
        </span>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── Activity tab ───────────────────────────────────────────────────────

function ActivityTab({
  dealId,
  workspaceId,
}: {
  dealId: string;
  workspaceId: string;
}) {
  const toast = useToast();
  const [items, setItems] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/crm/activities?workspace_id=${workspaceId}&deal_id=${dealId}&limit=100`
      );
      if (!res.ok) throw new Error("failed");
      const json = (await res.json()) as { items: CrmActivity[] };
      setItems(json.items);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dealId, workspaceId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const logNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          deal_id: dealId,
          kind: "note",
          subject: null,
          body: text,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setNote("");
      void load();
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-app bg-app p-2">
        <TextArea
          rows={2}
          placeholder="Log a note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            onClick={logNote}
            disabled={!note.trim() || submitting}
          >
            {submitting ? "Saving…" : "Log note"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-app p-4 text-center text-xs text-faint">
          No activity yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-app bg-app p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  {a.kind}
                </span>
                <span className="font-mono text-[0.6rem] text-faint">
                  {relativeTime(a.created_at)}
                </span>
              </div>
              {a.subject && (
                <div className="mt-1 text-sm font-medium text-app">
                  {a.subject}
                </div>
              )}
              {a.body && (
                <div className="mt-1 whitespace-pre-wrap text-sm text-secondary">
                  {a.body}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Files tab ──────────────────────────────────────────────────────────

interface AttachmentRef {
  id: string;
  name: string;
  url?: string;
}

function FilesTab({
  deal,
  patchDeal,
}: {
  deal: { id: string; custom: Record<string, unknown> };
  patchDeal: (patch: Partial<CrmDeal>) => Promise<unknown>;
}) {
  const attachments = useMemo<AttachmentRef[]>(() => {
    const raw = deal.custom?.attachments;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (x): x is AttachmentRef =>
        typeof x === "object" && x !== null && typeof (x as AttachmentRef).id === "string"
    );
  }, [deal.custom]);

  const removeAttachment = async (id: string) => {
    const next = attachments.filter((a) => a.id !== id);
    await patchDeal({
      custom: { ...deal.custom, attachments: next },
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-dashed border-app bg-app p-4 text-center text-xs text-muted">
        Drag a file from the desktop or use the paperclip in the file picker
        to attach.
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-muted">No attachments</div>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-app bg-app px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Icon name="paperclip" size={12} />
                <a
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-app hover:text-tool-accent"
                >
                  {a.name}
                </a>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label="Remove attachment"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-red-400"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Custom tab ─────────────────────────────────────────────────────────

function CustomTab({
  workspaceId,
  custom,
}: {
  workspaceId: string;
  custom: Record<string, unknown>;
}) {
  const [fields, setFields] = useState<CrmCustomField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/crm/custom-fields?workspace_id=${workspaceId}&record_type=deal`
        );
        if (!res.ok) throw new Error("failed");
        const json = (await res.json()) as { items: CrmCustomField[] };
        if (!cancelled) setFields(json.items);
      } catch {
        if (!cancelled) setFields([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (loading) return <div className="text-sm text-muted">Loading…</div>;
  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-app p-4 text-center text-xs text-muted">
        No custom fields defined yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.id}>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            {f.label}
          </div>
          <div className="mt-1 text-sm text-app">
            {renderCustomValue(f, (custom as Record<string, unknown>)[f.key])}
          </div>
        </div>
      ))}
    </div>
  );
}
