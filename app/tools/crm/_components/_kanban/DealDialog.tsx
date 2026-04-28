"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * DealDialog — quick-add modal used by PipelineView and DealsListView.
 * On submit POSTs /api/crm/deals/ and returns the created CrmDeal to the
 * caller. Caller decides where the row lands (kanban inserts it; list
 * prepends + opens detail).
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type {
  CrmCompany,
  CrmContact,
  CrmDeal,
  CrmPipelineStage,
  CrmVisibility,
} from "../../types";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Select,
  TextInput,
  useToast,
} from "./ui";
import { Typeahead } from "./Typeahead";

export interface DealDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  pipelineId: string;
  stages: CrmPipelineStage[];
  /** Pre-fill stage. Defaults to first stage. */
  defaultStageId?: string;
  onCreated: (deal: CrmDeal) => void;
}

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "JPY", "AUD", "CAD"];

function contactLabel(c: CrmContact): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.email || "Unnamed";
}

export default function DealDialog({
  open,
  onClose,
  workspaceId,
  pipelineId,
  stages,
  defaultStageId,
  onCreated,
}: DealDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState(defaultStageId ?? stages[0]?.id ?? "");
  const [closeDate, setCloseDate] = useState("");
  const [visibility, setVisibility] = useState<CrmVisibility>("team");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabelText, setContactLabelText] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyLabelText, setCompanyLabelText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setAmount("");
    setCurrency("USD");
    setStageId(defaultStageId ?? stages[0]?.id ?? "");
    setCloseDate("");
    setVisibility("team");
    setContactId(null);
    setContactLabelText(null);
    setCompanyId(null);
    setCompanyLabelText(null);
  };

  // Re-sync default stage when the dialog opens with a fresh default.
  useEffect(() => {
    if (open && defaultStageId) {
      setStageId(defaultStageId);
    }
  }, [open, defaultStageId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        workspace_id: workspaceId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: name.trim(),
        amount: amount === "" ? null : Number(amount),
        currency,
        close_date: closeDate || null,
        primary_contact_id: contactId,
        company_id: companyId,
        visibility,
      };
      const res = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "create failed");
      }
      const json = (await res.json()) as { item: CrmDeal };
      toast.push("success", `Created deal ${json.item.name}`);
      onCreated(json.item);
      reset();
      onClose();
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New deal" width={520}>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Deal name">
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme — annual seats"
              required
            />
          </Field>
        </div>

        <Field label="Amount">
          <NumberInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            step="0.01"
          />
        </Field>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Stage">
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Close date">
          <TextInput
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </Field>

        <div className="col-span-2">
          <Field label="Primary contact">
            <Typeahead<CrmContact>
              workspaceId={workspaceId}
              endpoint="/api/crm/contacts"
              value={contactId}
              valueLabel={contactLabelText}
              onChange={(id, raw) => {
                setContactId(id);
                setContactLabelText(raw ? contactLabel(raw) : null);
              }}
              toOption={(c) => ({
                id: c.id,
                label: contactLabel(c),
                sublabel: c.email ?? c.phone ?? undefined,
                raw: c,
              })}
              placeholder="Search contacts…"
            />
          </Field>
        </div>

        <div className="col-span-2">
          <Field label="Company">
            <Typeahead<CrmCompany>
              workspaceId={workspaceId}
              endpoint="/api/crm/companies"
              value={companyId}
              valueLabel={companyLabelText}
              onChange={(id, raw) => {
                setCompanyId(id);
                setCompanyLabelText(raw?.name ?? null);
              }}
              toOption={(c) => ({
                id: c.id,
                label: c.name,
                sublabel: c.domain ?? c.industry ?? undefined,
                raw: c,
              })}
              placeholder="Search companies…"
            />
          </Field>
        </div>

        <div className="col-span-2">
          <Field label="Visibility">
            <Select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CrmVisibility)}
            >
              <option value="public">Public — every workspace member</option>
              <option value="team">Team — default</option>
              <option value="assigned">Assigned only</option>
              <option value="owner">Owner only</option>
            </Select>
          </Field>
        </div>

        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting || !name.trim()}>
            {submitting ? "Creating…" : "Create deal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
