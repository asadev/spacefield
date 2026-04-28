"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * LeadConvertDialog — converts a lead into (contact + deal).
 *
 * The /api/crm/leads/convert endpoint always creates a fresh contact + deal
 * tied to the workspace's default pipeline + first stage. This dialog is
 * effectively a confirmation form that lets the user tweak the deal name,
 * amount, currency, and close date before posting. The "link to existing
 * contact" path the spec mentions would require a server-side variant of
 * the convert endpoint (POST currently always creates a contact); for v1
 * we always create a new contact so the user has a stable record they can
 * deduplicate later.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import type { CrmContact, CrmDeal, CrmLead } from "../types";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Select,
  TextInput,
  useToast,
} from "./_kanban/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  lead: CrmLead;
  onConverted: (out: { lead: CrmLead; contact: CrmContact; deal: CrmDeal }) => void;
}

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "JPY", "AUD", "CAD"];

function leadDisplayName(lead: CrmLead): string {
  const full = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return full || lead.email || "Lead";
}

export default function LeadConvertDialog({
  open,
  onClose,
  lead,
  onConverted,
}: Props) {
  const toast = useToast();
  const [dealName, setDealName] = useState(`${leadDisplayName(lead)} opportunity`);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [closeDate, setCloseDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDealName(`${leadDisplayName(lead)} opportunity`);
    setAmount("");
    setCurrency("USD");
    setCloseDate("");
  }, [lead.id, lead.first_name, lead.last_name, lead.email]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/leads/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          dealName: dealName.trim(),
          dealAmount: amount === "" ? null : Number(amount),
          dealCurrency: currency,
          closeDate: closeDate || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "convert failed");
      }
      const json = (await res.json()) as {
        lead: CrmLead;
        contact: CrmContact;
        deal: CrmDeal;
      };
      toast.push("success", `Converted to ${json.deal.name}`);
      onConverted(json);
      onClose();
    } catch (err) {
      toast.push("error", (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Convert ${leadDisplayName(lead)}`} width={520}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="rounded-md border border-app bg-app p-3 text-xs text-secondary">
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            Lead source data
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <KV k="Name" v={leadDisplayName(lead)} />
            <KV k="Email" v={lead.email ?? "—"} />
            <KV k="Phone" v={lead.phone ?? "—"} />
            <KV k="Source" v={lead.source ?? "—"} />
          </div>
          <div className="mt-2 text-[0.65rem] text-muted">
            A new contact will be created from these details and linked to
            the deal below.
          </div>
        </div>

        <Field label="Deal name">
          <TextInput
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <Field label="Close date">
          <TextInput
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </Field>

        <div className="rounded-md border border-app bg-app p-2 text-[0.65rem] text-muted">
          The deal lands in your workspace&apos;s default pipeline at the
          first open stage. Move it later from the pipeline kanban.
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!dealName.trim() || submitting}
          >
            {submitting ? "Converting…" : "Convert lead"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {k}
      </div>
      <div className="text-sm text-app">{v}</div>
    </div>
  );
}
