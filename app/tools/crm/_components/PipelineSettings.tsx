"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * PipelineSettings — admin-only editor for the workspace's pipelines
 * and their stages. Modal/sheet opened from the gear icon next to the
 * pipeline picker on PipelineView.
 *
 * What it can do
 *   - Create new pipeline (just name)
 *   - Rename / delete pipeline (cascade warning)
 *   - Mark a pipeline as default
 *   - Add / rename / delete stages
 *   - Edit stage kind (open / won / lost), probability, rot_days, color
 *   - Reorder stages via the up/down handles (drag-handle is provided in
 *     the visual but only triggers a position swap on click for v1 to
 *     keep the modal lean)
 *
 * Members see the modal disabled with a "view only" notice.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import type {
  CrmPipelineStage,
  CrmPipelineWithStages,
  CrmStageKind,
} from "../types";
import { STAGE_KIND_VALUES } from "../types";
import {
  Button,
  Field,
  Icon,
  Modal,
  NumberInput,
  Select,
  TextInput,
  useToast,
} from "./_kanban/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  pipelines: CrmPipelineWithStages[];
  activePipelineId: string | null;
  onChanged: () => void;
  isAdmin: boolean;
}

const PRESET_COLORS = [
  null,
  "#94a3b8",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

export default function PipelineSettings({
  open,
  onClose,
  workspaceId,
  pipelines,
  activePipelineId,
  onChanged,
  isAdmin,
}: Props) {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(activePipelineId);
  const [createName, setCreateName] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset selection when the dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedId(activePipelineId);
    }
  }, [open, activePipelineId]);

  const selected = useMemo(
    () => pipelines.find((p) => p.id === selectedId) ?? null,
    [pipelines, selectedId]
  );

  const createPipeline = async () => {
    const name = createName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/crm/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, name }),
      });
      if (!res.ok) throw new Error("create failed");
      const json = (await res.json()) as { item: { id: string } };
      setCreateName("");
      onChanged();
      setSelectedId(json.item.id);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const renamePipeline = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/crm/pipelines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("rename failed");
      onChanged();
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const setDefault = async (id: string) => {
    try {
      // Clear is_default elsewhere first, then mark this one.
      await Promise.all(
        pipelines
          .filter((p) => p.is_default && p.id !== id)
          .map((p) =>
            fetch(`/api/crm/pipelines/${p.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_default: false }),
            })
          )
      );
      const res = await fetch(`/api/crm/pipelines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (!res.ok) throw new Error("set default failed");
      onChanged();
      toast.push("success", "Default pipeline updated");
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const deletePipeline = async (p: CrmPipelineWithStages) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete pipeline "${p.name}"? Every deal in this pipeline ` +
          `will be deleted as well. This can't be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/crm/pipelines/${p.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      onChanged();
      if (selectedId === p.id) setSelectedId(null);
      toast.push("success", "Pipeline deleted");
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const addStage = async () => {
    if (!selected) return;
    try {
      const position = (selected.stages[selected.stages.length - 1]?.position ?? 0) + 1000;
      const res = await fetch(`/api/crm/pipelines/${selected.id}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New stage",
          kind: "open",
          position,
          probability: 50,
        }),
      });
      if (!res.ok) throw new Error("create stage failed");
      onChanged();
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const patchStage = async (
    stageId: string,
    patch: Partial<Omit<CrmPipelineStage, "id" | "pipeline_id" | "created_at">>
  ) => {
    try {
      const res = await fetch(`/api/crm/pipelines/stages/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("update failed");
      onChanged();
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const deleteStage = async (stage: CrmPipelineStage) => {
    if (!selected) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete stage "${stage.name}"? Deals in this stage will block the delete; move them first.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/crm/pipelines/stages/${stage.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed (move deals first)");
      onChanged();
    } catch (err) {
      toast.push("error", (err as Error).message);
    }
  };

  const moveStage = async (stage: CrmPipelineStage, dir: -1 | 1) => {
    if (!selected) return;
    const idx = selected.stages.findIndex((s) => s.id === stage.id);
    const swap = selected.stages[idx + dir];
    if (!swap) return;
    await Promise.all([
      patchStage(stage.id, { position: swap.position }),
      patchStage(swap.id, { position: stage.position }),
    ]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pipelines & stages"
      width={720}
    >
      {!isAdmin && (
        <div className="mb-3 rounded-md border border-app bg-app p-3 text-xs text-muted">
          You&apos;re viewing this in read-only mode. Owners or admins can
          edit pipelines.
        </div>
      )}

      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* sidebar — pipeline list */}
        <aside className="flex flex-col gap-2">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            Pipelines
          </div>
          <ul className="space-y-1">
            {pipelines.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left ${
                    selectedId === p.id
                      ? "border border-tool-accent bg-tool-accent-soft text-tool-accent"
                      : "border border-transparent text-secondary hover:bg-surface hover:text-app"
                  }`}
                >
                  <span className="text-sm">{p.name}</span>
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                    {p.stages.length} stages
                    {p.is_default ? " · default" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {isAdmin && (
            <div className="mt-2 flex gap-1">
              <TextInput
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="New pipeline name…"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={createPipeline}
                disabled={!createName.trim() || busy}
              >
                <Icon name="plus" size={12} />
              </Button>
            </div>
          )}
        </aside>

        {/* detail */}
        <section className="flex min-w-0 flex-col gap-3">
          {selected ? (
            <>
              <div className="flex items-center gap-2">
                <Field label="Pipeline name">
                  <TextInput
                    defaultValue={selected.name}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== selected.name) {
                        void renamePipeline(selected.id, v);
                      }
                    }}
                  />
                </Field>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                      Default
                    </span>
                    <Button
                      size="sm"
                      variant={selected.is_default ? "primary" : "secondary"}
                      onClick={() => !selected.is_default && setDefault(selected.id)}
                      disabled={selected.is_default}
                    >
                      {selected.is_default ? "Default" : "Make default"}
                    </Button>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                      Danger
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deletePipeline(selected)}
                      disabled={selected.is_default}
                      title={
                        selected.is_default
                          ? "Pick another default first"
                          : undefined
                      }
                    >
                      <Icon name="trash" size={12} />
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-app bg-app">
                <div className="flex items-center justify-between border-b border-app px-3 py-2">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                    Stages
                  </span>
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={addStage}>
                      <Icon name="plus" size={12} />
                      Add stage
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-app">
                  {selected.stages.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted">
                      No stages yet.
                    </div>
                  ) : (
                    selected.stages.map((stage, i) => (
                      <StageRow
                        key={stage.id}
                        stage={stage}
                        first={i === 0}
                        last={i === selected.stages.length - 1}
                        isAdmin={isAdmin}
                        onMove={(dir) => moveStage(stage, dir)}
                        onPatch={(p) => patchStage(stage.id, p)}
                        onDelete={() => deleteStage(stage)}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-app p-6 text-center text-xs text-muted">
              {pipelines.length === 0
                ? "No pipelines yet. Create one to get started."
                : "Select a pipeline to edit its stages."}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ── Stage row ──────────────────────────────────────────────────────────

function StageRow({
  stage,
  first,
  last,
  isAdmin,
  onMove,
  onPatch,
  onDelete,
}: {
  stage: CrmPipelineStage;
  first: boolean;
  last: boolean;
  isAdmin: boolean;
  onMove: (dir: -1 | 1) => void;
  onPatch: (
    p: Partial<Omit<CrmPipelineStage, "id" | "pipeline_id" | "created_at">>
  ) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [probability, setProbability] = useState<string>(String(stage.probability));
  const [rotDays, setRotDays] = useState<string>(
    stage.rot_days === null ? "" : String(stage.rot_days)
  );

  // Resync on external change.
  useEffect(() => {
    setName(stage.name);
    setProbability(String(stage.probability));
    setRotDays(stage.rot_days === null ? "" : String(stage.rot_days));
  }, [stage.name, stage.probability, stage.rot_days]);

  return (
    <div className="grid grid-cols-[auto_1fr_120px_120px_100px_140px_auto] items-end gap-2 px-3 py-2">
      <div className="flex flex-col gap-0.5 text-faint">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={first || !isAdmin}
          aria-label="Move up"
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-surface disabled:opacity-30"
        >
          <Icon name="chevronUp" size={12} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={last || !isAdmin}
          aria-label="Move down"
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-surface disabled:opacity-30"
        >
          <Icon name="chevronDown" size={12} />
        </button>
      </div>

      <Field label="Name">
        <TextInput
          value={name}
          disabled={!isAdmin}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== stage.name) onPatch({ name: name.trim() });
          }}
        />
      </Field>

      <Field label="Kind">
        <Select
          value={stage.kind}
          disabled={!isAdmin}
          onChange={(e) => onPatch({ kind: e.target.value as CrmStageKind })}
        >
          {STAGE_KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Probability">
        <NumberInput
          value={probability}
          disabled={!isAdmin}
          min={0}
          max={100}
          onChange={(e) => setProbability(e.target.value)}
          onBlur={() => {
            const n = Math.max(0, Math.min(100, Number(probability) || 0));
            if (n !== stage.probability) onPatch({ probability: n });
          }}
        />
      </Field>

      <Field label="Rot days">
        <NumberInput
          value={rotDays}
          disabled={!isAdmin}
          min={0}
          placeholder="∞"
          onChange={(e) => setRotDays(e.target.value)}
          onBlur={() => {
            const n = rotDays === "" ? null : Math.max(0, Number(rotDays));
            if (n !== stage.rot_days) onPatch({ rot_days: n });
          }}
        />
      </Field>

      <Field label="Color">
        <div className="flex items-center gap-1">
          {PRESET_COLORS.map((c, i) => (
            <button
              key={i}
              type="button"
              disabled={!isAdmin}
              onClick={() => onPatch({ color: c })}
              aria-label={c ?? "no color"}
              className={`h-6 w-6 rounded-full border ${
                stage.color === c
                  ? "border-app ring-2 ring-tool-accent"
                  : "border-app"
              }`}
              style={{
                background: c ?? "transparent",
                backgroundImage: c
                  ? undefined
                  : "linear-gradient(135deg, transparent 45%, var(--text-faint) 45%, var(--text-faint) 55%, transparent 55%)",
              }}
            />
          ))}
        </div>
      </Field>

      <button
        type="button"
        onClick={onDelete}
        disabled={!isAdmin}
        aria-label="Delete stage"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-faint hover:bg-surface hover:text-red-400 disabled:opacity-30"
      >
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}
