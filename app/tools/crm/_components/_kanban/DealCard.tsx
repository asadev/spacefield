"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * DealCard — kanban card for a single CrmDeal.
 * Pure UI; no fetch. Hydrates with the optional joined company/contact maps
 * the parent passes in.
 * ───────────────────────────────────────────────────────────────────── */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  CrmCompany,
  CrmContact,
  CrmDeal,
  CrmPipelineStage,
} from "../../types";
import {
  formatCloseDate,
  formatDealAmount,
  isRotting,
} from "./helpers";
import { Avatar, Icon } from "./ui";

interface DealCardProps {
  deal: CrmDeal;
  stage: CrmPipelineStage | undefined;
  contactsById: Map<string, CrmContact>;
  companiesById: Map<string, CrmCompany>;
  onOpen: (deal: CrmDeal) => void;
  /** When true, the card is being dragged (overlay or shadow ghost). */
  dragging?: boolean;
}

export default function DealCard({
  deal,
  stage,
  contactsById,
  companiesById,
  onOpen,
  dragging = false,
}: DealCardProps) {
  const sortable = useSortable({ id: deal.id, data: { type: "deal", deal } });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const contact = deal.primary_contact_id
    ? contactsById.get(deal.primary_contact_id)
    : null;
  const company = deal.company_id ? companiesById.get(deal.company_id) : null;
  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
      contact.email ||
      "Contact"
    : null;
  const rotting = isRotting(deal, stage);
  const closePhrase = formatCloseDate(deal.close_date);
  const closeColor =
    deal.close_date && closePhrase.includes("overdue")
      ? "text-red-400"
      : "text-muted";

  const assigneeCount = deal.assignee_ids.length;
  const showAssignees = deal.assignee_ids.slice(0, 3);
  const assigneeOverflow = assigneeCount - showAssignees.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative cursor-grab rounded-md border bg-app-elevated p-2.5 text-left shadow-sm transition-shadow active:cursor-grabbing ${
        dragging || isDragging
          ? "border-tool-accent shadow-lg"
          : "border-app hover:-translate-y-0.5 hover:border-tool-accent hover:shadow-md"
      }`}
      {...attributes}
      {...listeners}
    >
      {rotting && (
        <span
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-app px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.16em] text-red-400"
          title="Stage rot threshold reached"
        >
          <Icon name="alert" size={10} />
          stale
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(deal);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="block w-full pr-10 text-left"
      >
        <div className="line-clamp-1 text-sm font-medium text-app">
          {deal.name}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[0.7rem] tabular-nums text-tool-accent">
            {formatDealAmount(deal.amount, deal.currency)}
          </span>
          <span className={`text-[0.65rem] ${closeColor}`}>
            {closePhrase}
          </span>
        </div>
        {(contact || company) && (
          <div className="mt-2 flex items-center gap-1.5">
            {contact && (
              <Avatar label={contactName ?? "?"} size={18} title={contactName ?? undefined} />
            )}
            <span className="line-clamp-1 text-[0.7rem] text-secondary">
              {contactName ?? company?.name ?? ""}
              {contactName && company ? ` · ${company.name}` : ""}
            </span>
          </div>
        )}
        {assigneeCount > 0 && (
          <div className="mt-2 flex -space-x-1">
            {showAssignees.map((id) => (
              <Avatar key={id} label={id.slice(0, 2)} size={18} />
            ))}
            {assigneeOverflow > 0 && (
              <span className="inline-flex h-[18px] items-center justify-center rounded-full border border-app bg-app px-1.5 font-mono text-[0.55rem] text-faint">
                +{assigneeOverflow}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
