"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * LeadsView — table of inbound leads with status pills and a one-click
 * conversion flow. New-lead form sits inline at the top and POSTs to
 * /api/crm/leads. Each row exposes:
 *   - Status flip (working / qualified / disqualified)
 *   - Convert → opens LeadConvertDialog → /api/crm/leads/convert
 *
 * Optimistic UI for status flips. On error we revert + toast.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type {
  CrmContact,
  CrmDeal,
  CrmLead,
  CrmLeadStatus,
} from "../types";
import { LEAD_STATUS_VALUES } from "../types";
import LeadConvertDialog from "./LeadConvertDialog";
import {
  Button,
  Field,
  Icon,
  Select,
  TextArea,
  TextInput,
  ToastHost,
  useToast,
} from "./_kanban/ui";
import { relativeTime } from "./_records/helpers";

interface Props {
  width: number;
  search: string;
  onSearchChange: (v: string) => void;
}

const STATUS_LABELS: Record<CrmLeadStatus, string> = {
  new: "New",
  working: "Working",
  qualified: "Qualified",
  disqualified: "Disqualified",
  converted: "Converted",
};

const STATUS_COLOR: Record<CrmLeadStatus, string> = {
  new: "var(--text-secondary)",
  working: "var(--tool-accent)",
  qualified: "rgb(34 197 94)",
  disqualified: "rgb(239 68 68)",
  converted: "rgb(168 85 247)",
};

function leadName(l: CrmLead): string {
  const full = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return full || l.email || "Unnamed lead";
}

export default function LeadsView(props: Props) {
  return (
    <ToastHost>
      <LeadsViewInner {...props} />
    </ToastHost>
  );
}

function LeadsViewInner({ width, search, onSearchChange }: Props) {
  const { current, signedIn } = useWorkspace();
  const workspaceId = current.kind === "team" ? current.id : null;
  const toast = useToast();

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CrmLeadStatus | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [convertTarget, setConvertTarget] = useState<CrmLead | null>(null);
  const compact = width < 720;

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLeads([]);
      return;
    }
    setLoading(true);
    try {
      const url = new URL("/api/crm/leads", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      if (search.trim()) url.searchParams.set("search", search.trim());
      url.searchParams.set("limit", "200");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("failed to load leads");
      const json = (await res.json()) as { items: CrmLead[] };
      setLeads(json.items);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter, search, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (lead: CrmLead, status: CrmLeadStatus) => {
    const prev = leads;
    setLeads((cur) =>
      cur.map((l) => (l.id === lead.id ? { ...l, status } : l))
    );
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("update failed");
      const json = (await res.json()) as { item: CrmLead };
      setLeads((cur) => cur.map((l) => (l.id === lead.id ? json.item : l)));
    } catch (err) {
      setLeads(prev);
      toast.push("error", (err as Error).message);
    }
  };

  const handleConverted = (out: {
    lead: CrmLead;
    contact: CrmContact;
    deal: CrmDeal;
  }) => {
    setLeads((cur) => cur.map((l) => (l.id === out.lead.id ? out.lead : l)));
  };

  const filteredLeads = useMemo(() => leads, [leads]);

  if (!signedIn || !workspaceId) {
    return (
      <EmptyPane
        title={signedIn ? "Pick a team workspace" : "Sign in"}
        body={
          signedIn
            ? "Personal workspaces don't sync to the CRM. Switch to a team workspace from the desktop's workspace switcher."
            : "Sign in to load your inbound leads."
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-app text-app">
      {/* top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app px-3 py-2">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CrmLeadStatus | "")}
          className="min-w-[140px]"
        >
          <option value="">All statuses</option>
          {LEAD_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>

        <div className="relative ml-1 hidden md:block">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint">
            <Icon name="search" size={12} />
          </span>
          <TextInput
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search leads…"
            className="pl-7"
            style={{ width: 220 }}
          />
        </div>

        <div className="ml-auto">
          <Button variant="primary" onClick={() => setShowCreate((v) => !v)}>
            <Icon name="plus" size={12} />
            New lead
          </Button>
        </div>
      </div>

      {showCreate && (
        <NewLeadForm
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onCreated={(lead) => {
            setLeads((cur) => [lead, ...cur]);
            setShowCreate(false);
          }}
        />
      )}

      {/* table */}
      <div className="flex-1 overflow-auto">
        {loading && leads.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            No leads yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-app bg-app text-left">
              <tr className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
                <th className="px-3 py-2">Name</th>
                {!compact && <th className="px-3 py-2">Email</th>}
                {!compact && <th className="px-3 py-2">Phone</th>}
                {!compact && <th className="px-3 py-2">Source</th>}
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-app hover:bg-surface"
                >
                  <td className="px-3 py-2 text-app">{leadName(lead)}</td>
                  {!compact && (
                    <td className="px-3 py-2 text-secondary">
                      {lead.email ?? "—"}
                    </td>
                  )}
                  {!compact && (
                    <td className="px-3 py-2 text-secondary">
                      {lead.phone ?? "—"}
                    </td>
                  )}
                  {!compact && (
                    <td className="px-3 py-2 text-secondary">
                      {lead.source ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-[0.7rem] text-faint">
                    {relativeTime(lead.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <LeadActions
                      lead={lead}
                      onStatusChange={(s) => updateStatus(lead, s)}
                      onConvert={() => setConvertTarget(lead)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {convertTarget && (
        <LeadConvertDialog
          open
          lead={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={handleConverted}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CrmLeadStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-app bg-app px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em]"
      style={{ color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function LeadActions({
  lead,
  onStatusChange,
  onConvert,
}: {
  lead: CrmLead;
  onStatusChange: (s: CrmLeadStatus) => void;
  onConvert: () => void;
}) {
  if (lead.status === "converted") {
    return (
      <span className="font-mono text-[0.6rem] text-tool-accent">
        Converted
        {lead.converted_deal_id ? ` · ${lead.converted_deal_id.slice(0, 8)}` : ""}
      </span>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      <select
        value={lead.status}
        onChange={(e) => onStatusChange(e.target.value as CrmLeadStatus)}
        className="rounded-md border border-app bg-app px-2 py-1 text-xs text-secondary"
      >
        {LEAD_STATUS_VALUES.filter((s) => s !== "converted").map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <Button size="sm" variant="primary" onClick={onConvert}>
        Convert
      </Button>
    </div>
  );
}

// ── new-lead form ────────────────────────────────────────────────────────

function NewLeadForm({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (lead: CrmLead) => void;
}) {
  const toast = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName && !lastName && !email) {
      toast.push("error", "Add at least a name or email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          first_name: firstName || null,
          last_name: lastName || null,
          email: email || null,
          phone: phone || null,
          source: source || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "failed");
      }
      const json = (await res.json()) as { item: CrmLead };
      onCreated(json.item);
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-2 gap-3 border-b border-app bg-app-elevated p-3 md:grid-cols-3"
    >
      <Field label="First name">
        <TextInput
          autoFocus
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </Field>
      <Field label="Last name">
        <TextInput
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </Field>
      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <TextInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field label="Source">
        <TextInput
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="website / referral / event…"
        />
      </Field>
      <div className="col-span-2 md:col-span-3">
        <Field label="Notes">
          <TextArea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save lead"}
        </Button>
      </div>
    </form>
  );
}

function EmptyPane({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-app p-6">
      <div className="w-full max-w-md rounded-xl border border-app bg-app-elevated p-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.leads
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">{title}</h2>
        <p className="mt-2 text-sm text-secondary">{body}</p>
      </div>
    </div>
  );
}
