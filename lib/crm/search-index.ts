import "server-only";

import { indexDocument, unindexDocument } from "@/lib/search/indexer";

/* CRM → search_documents glue.
 *
 * Wraps `indexDocument`/`unindexDocument` with the per-entity title +
 * subtitle + body shape so every CRM mutation path (REST API routes,
 * /api/crm/leads/convert, AI agent skills) writes the same document
 * structure. The shape is the contract Cmd-K + /search rely on.
 *
 * Every helper is best-effort: failures are logged inside the underlying
 * helper but never thrown. Search staying in sync is not allowed to
 * brick the originating write.
 */

interface ContactRow {
  id: string;
  workspace_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  notes?: string | null;
}

interface LeadRow {
  id: string;
  workspace_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
}

interface DealRow {
  id: string;
  workspace_id: string;
  name: string;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  close_date?: string | null;
}

function fullName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const joined = `${f} ${l}`.trim();
  return joined.length > 0 ? joined : "Untitled";
}

export async function indexContact(row: ContactRow): Promise<void> {
  const title = fullName(row.first_name, row.last_name);
  const subtitle = [row.job_title, row.email, row.phone]
    .filter((v): v is string => !!v && v.length > 0)
    .join(" · ");
  await indexDocument({
    workspaceId: row.workspace_id,
    entityType: "contact",
    entityId: row.id,
    title,
    subtitle: subtitle || null,
    body: row.notes ?? null,
    href: `/tools/crm/contacts/${row.id}`,
    icon: "user",
  });
}

export async function unindexContact(id: string): Promise<void> {
  await unindexDocument({ entityType: "contact", entityId: id });
}

export async function indexLead(row: LeadRow): Promise<void> {
  const title = fullName(row.first_name, row.last_name);
  const subtitle = [row.source, row.status, row.email, row.phone]
    .filter((v): v is string => !!v && v.length > 0)
    .join(" · ");
  await indexDocument({
    workspaceId: row.workspace_id,
    entityType: "lead",
    entityId: row.id,
    title,
    subtitle: subtitle || null,
    body: row.notes ?? null,
    href: `/tools/crm/leads/${row.id}`,
    icon: "sparkles",
  });
}

export async function unindexLead(id: string): Promise<void> {
  await unindexDocument({ entityType: "lead", entityId: id });
}

export async function indexDeal(row: DealRow): Promise<void> {
  const moneyParts: string[] = [];
  if (typeof row.amount === "number") {
    moneyParts.push(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: row.currency ?? "USD",
        maximumFractionDigits: 0,
      }).format(row.amount)
    );
  }
  if (row.status) moneyParts.push(row.status);
  if (row.close_date) moneyParts.push(`close ${row.close_date}`);
  const subtitle = moneyParts.join(" · ");
  await indexDocument({
    workspaceId: row.workspace_id,
    entityType: "deal",
    entityId: row.id,
    title: row.name,
    subtitle: subtitle || null,
    body: null,
    href: `/tools/crm/deals/${row.id}`,
    icon: "briefcase",
  });
}

export async function unindexDeal(id: string): Promise<void> {
  await unindexDocument({ entityType: "deal", entityId: id });
}
