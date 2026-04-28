"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * IntegrationButtons — wires a CRM record into the rest of Spacefield.
 *
 * Three actions:
 *   1. Save to Files       — JSON-export the record + recent activities to a
 *                            workspace_files row tagged "crm-export".
 *   2. Open in Documents   — create a starter "{name} — notes" file and open
 *                            it in the Documents app via openApp().
 *   3. Share to Chat       — open the Chat app with a pre-filled compose
 *                            referencing the record.
 *
 * Used by DealDetail (Phase 2A) and RecordDetail (Phase 2B) footers; both
 * agents import this component from Phase 2C.
 *
 * Auth + workspace context are inferred from useWorkspace(); the buttons
 * are silently inert when the user isn't signed in or has no team selected
 * (Phase 1 already gates upstream — this component just degrades gracefully).
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type { CrmActivity, CrmRecordType } from "../types";
import { RecIcon } from "./_records/Icon";

export interface IntegrationButtonsProps {
  recordType: CrmRecordType;
  recordId: string;
  recordName: string;
  /** Optional fields snapshot — JSON-exported to Files. */
  recordSnapshot?: Record<string, unknown>;
  /** Optional starter body for "Open in Documents" — falls back to a stub. */
  documentBody?: string;
  /** Optional pre-loaded recent activities to embed in exports. */
  activities?: CrmActivity[];
  /** Cross-tool launcher passed down by the desktop. If omitted, the
   * Documents/Chat buttons are disabled. */
  openApp?: (slug: string, params?: Record<string, unknown>) => void;
  /** Compact mode trims labels to icon-only. */
  compact?: boolean;
}

function utf8Base64(input: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(input, "utf8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildSummary(
  recordType: CrmRecordType,
  recordName: string,
  snapshot: Record<string, unknown> | undefined,
  activities: CrmActivity[] | undefined
): string {
  const lines: string[] = [];
  lines.push(`# ${recordName}`);
  lines.push("");
  lines.push(`Record type: ${recordType}`);
  if (snapshot) {
    if (typeof snapshot.email === "string" && snapshot.email) {
      lines.push(`Email: ${snapshot.email}`);
    }
    if (typeof snapshot.phone === "string" && snapshot.phone) {
      lines.push(`Phone: ${snapshot.phone}`);
    }
    if (typeof snapshot.domain === "string" && snapshot.domain) {
      lines.push(`Domain: ${snapshot.domain}`);
    }
    if (typeof snapshot.website === "string" && snapshot.website) {
      lines.push(`Website: ${snapshot.website}`);
    }
    if (typeof snapshot.amount === "number") {
      lines.push(`Amount: ${snapshot.amount}`);
    }
  }
  if (activities && activities.length) {
    lines.push("");
    lines.push("## Recent activity");
    lines.push("");
    for (const a of activities.slice(0, 12)) {
      const when = a.created_at ? new Date(a.created_at).toISOString() : "";
      const subj = a.subject ?? "(no subject)";
      lines.push(`- [${a.kind}] ${when} — ${subj}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export default function IntegrationButtons({
  recordType,
  recordId,
  recordName,
  recordSnapshot,
  documentBody,
  activities,
  openApp,
  compact = false,
}: IntegrationButtonsProps) {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const disabled = !signedIn || !workspaceId;

  const [busy, setBusy] = useState<null | "files" | "docs" | "chat">(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const showToast = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 2400);
  };

  const exportJson = useCallback(() => {
    return {
      kind: "crm-export" as const,
      record_type: recordType,
      record_id: recordId,
      record_name: recordName,
      exported_at: new Date().toISOString(),
      record: recordSnapshot ?? null,
      activities: activities ?? null,
    };
  }, [recordType, recordId, recordName, recordSnapshot, activities]);

  const onSaveToFiles = useCallback(async () => {
    if (disabled || !workspaceId) return;
    setBusy("files");
    try {
      const payload = exportJson();
      const json = JSON.stringify(payload, null, 2);
      const safeName = recordName.replace(/[^\w\-. ]+/g, "_").slice(0, 80);
      const res = await fetch("/api/files/save-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: `${safeName} — ${recordType}.json`,
          contentType: "application/json",
          contentBase64: utf8Base64(json),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "save failed");
      }
      showToast("ok", "Saved to Files");
    } catch (e) {
      showToast("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [disabled, workspaceId, exportJson, recordName, recordType]);

  const onOpenInDocuments = useCallback(async () => {
    if (disabled || !workspaceId || !openApp) return;
    setBusy("docs");
    try {
      const body =
        documentBody ?? buildSummary(recordType, recordName, recordSnapshot, activities);
      const safeName = recordName.replace(/[^\w\-. ]+/g, "_").slice(0, 80);
      const res = await fetch("/api/files/save-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: `${safeName} — notes.md`,
          contentType: "text/markdown",
          contentBase64: utf8Base64(body),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "save failed");
      }
      const json = (await res.json()) as { file?: { id?: string } };
      const fileId = json.file?.id;
      if (!fileId) throw new Error("no fileId");
      openApp("documents", { fileId });
      showToast("ok", "Opened in Documents");
    } catch (e) {
      showToast("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [
    disabled,
    workspaceId,
    openApp,
    documentBody,
    recordType,
    recordName,
    recordSnapshot,
    activities,
  ]);

  const onShareToChat = useCallback(() => {
    if (disabled || !openApp) return;
    setBusy("chat");
    try {
      const link = `crm://${recordType}/${recordId}`;
      const prefill = `Check out ${recordName} (${recordType}) — ${link}`;
      openApp("chat", {
        prefill,
        crmRef: { recordType, recordId, recordName },
      });
      showToast("ok", "Opened Chat");
    } finally {
      setBusy(null);
    }
  }, [disabled, openApp, recordType, recordId, recordName]);

  const btnClass =
    "inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btnClass}
        onClick={onSaveToFiles}
        disabled={disabled || busy === "files"}
        title="Save record JSON to Files"
      >
        <RecIcon name="paperclip" size={12} />
        {!compact && <span>{busy === "files" ? "Saving…" : "Save to Files"}</span>}
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={onOpenInDocuments}
        disabled={disabled || !openApp || busy === "docs"}
        title="Open record notes in Documents"
      >
        <RecIcon name="edit" size={12} />
        {!compact && <span>{busy === "docs" ? "Opening…" : "Open in Documents"}</span>}
      </button>
      <button
        type="button"
        className={btnClass}
        onClick={onShareToChat}
        disabled={disabled || !openApp}
        title="Share record link to Chat"
      >
        <RecIcon name="external" size={12} />
        {!compact && <span>Share to Chat</span>}
      </button>
      {toast && (
        <span
          role="status"
          className="font-mono text-[0.6rem] uppercase tracking-[0.16em]"
          style={{ color: toast.kind === "ok" ? "var(--success, #16a34a)" : "var(--danger, #dc2626)" }}
        >
          {toast.text}
        </span>
      )}
    </div>
  );
}
