"use client";

/* ComparisonTable — full feature comparison across all four tiers.
 *
 * Desktop (>= md): a single grid table. Sticky-left first column
 * holds feature names; four columns to the right show Free / Pro /
 * Team / Enterprise. Each cell is either a tick, a dash, or a short
 * text value. Tick / dash are rendered as inline SVGs (the spec
 * forbids literal ✓ / ✗ characters in markup).
 *
 * Mobile (< md): a 4-tab pill switcher. Tapping a tier reveals all
 * features as a single column for that tier. This avoids the table
 * collapsing into an unreadable stripe on phones.
 *
 * Data lives in this file — it's a marketing artefact, not anything
 * other code consumes. Add or remove rows freely. */

import { useState } from "react";

type CellValue = boolean | string;

interface FeatureRow {
  label: string;
  values: [CellValue, CellValue, CellValue, CellValue]; // [free, pro, team, enterprise]
  hint?: string;
}

interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

const TIER_NAMES = ["Free", "Pro", "Team", "Enterprise"] as const;

const GROUPS: FeatureGroup[] = [
  {
    title: "Storage",
    rows: [
      {
        label: "Storage per workspace",
        values: ["5 GB", "100 GB", "1 TB", "Custom"],
      },
      {
        label: "Max single file size",
        values: ["100 MB", "2 GB", "10 GB", "Custom"],
      },
      {
        label: "Stackable storage add-ons",
        values: [true, true, true, true],
        hint: "Add +500 GB, +2 TB, or +10 TB to any workspace",
      },
    ],
  },
  {
    title: "Members and workspaces",
    rows: [
      {
        label: "Workspaces you can own",
        values: ["1", "5", "25", "Unlimited"],
      },
      {
        label: "Members per workspace",
        values: ["5", "10", "50", "Unlimited"],
      },
      {
        label: "Roles (Owner / Admin / Member)",
        values: [true, true, true, true],
      },
      {
        label: "Email invitations",
        values: [true, true, true, true],
      },
      {
        label: "Member visibility rules",
        values: [false, true, true, true],
      },
    ],
  },
  {
    title: "Apps and tools",
    rows: [
      {
        label: "All real estate tools",
        values: [true, true, true, true],
      },
      {
        label: "All productivity tools",
        values: [true, true, true, true],
      },
      {
        label: "All finance and market tools",
        values: [true, true, true, true],
      },
      {
        label: "Premium themes and wallpapers",
        values: [false, true, true, true],
      },
      {
        label: "Custom wallpaper upload",
        values: [true, true, true, true],
      },
    ],
  },
  {
    title: "Files Manager",
    rows: [
      { label: "Drag-and-drop uploads", values: [true, true, true, true] },
      { label: "Folders, tags, and search", values: [true, true, true, true] },
      { label: "File preview", values: [true, true, true, true] },
      { label: "Trash with restore", values: [true, true, true, true] },
      {
        label: "Share links",
        values: ["Internal", "External", "External", "External"],
      },
    ],
  },
  {
    title: "Documents and Sheets",
    rows: [
      {
        label: "Word-grade editor (.docx round-trip)",
        values: [true, true, true, true],
      },
      {
        label: "Excel-grade editor (.xlsx round-trip)",
        values: [true, true, true, true],
      },
      {
        label: "Real-time co-editing",
        values: [false, true, true, true],
      },
      {
        label: "Version history",
        values: ["7 days", "30 days", "90 days", "Custom"],
      },
    ],
  },
  {
    title: "Chat",
    rows: [
      { label: "Real-time messaging", values: [true, true, true, true] },
      { label: "File attachments", values: [true, true, true, true] },
      { label: "Mentions and threads", values: [true, true, true, true] },
      {
        label: "Message history",
        values: ["30 days", "1 year", "Unlimited", "Unlimited"],
      },
    ],
  },
  {
    title: "CRM",
    rows: [
      {
        label: "Contacts, companies, deals, leads",
        values: [true, true, true, true],
      },
      { label: "Inventory module", values: [false, true, true, true] },
      {
        label: "Custom fields",
        values: ["3", "20", "Unlimited", "Unlimited"],
      },
      {
        label: "Visibility and access rules",
        values: [false, true, true, true],
      },
      { label: "Reports and exports", values: [false, true, true, true] },
    ],
  },
  {
    title: "Admin tools",
    rows: [
      { label: "Workspace settings", values: [true, true, true, true] },
      { label: "Member roles and permissions", values: [true, true, true, true] },
      { label: "App and tool gating", values: [false, true, true, true] },
      { label: "Activity log", values: [false, false, true, true] },
      { label: "SSO (SAML / OIDC)", values: [false, false, false, true] },
      { label: "Audit log export", values: [false, false, true, true] },
    ],
  },
  {
    title: "Support",
    rows: [
      {
        label: "Channel",
        values: ["Community", "Email", "Priority email", "Dedicated"],
      },
      {
        label: "Response time",
        values: ["Best effort", "48h", "12h", "Custom"],
      },
      {
        label: "Onboarding session",
        values: [false, false, true, true],
      },
    ],
  },
  {
    title: "SLA and uptime",
    rows: [
      {
        label: "Uptime target",
        values: ["—", "99.5%", "99.9%", "99.95%"],
      },
      {
        label: "Custom SLA",
        values: [false, false, false, true],
      },
    ],
  },
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}

function DashIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 8h8" />
    </svg>
  );
}

function renderCell(value: CellValue): React.ReactNode {
  if (value === true) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
        <CheckIcon />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface text-faint">
        <DashIcon />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className="text-sm text-app">{value}</span>;
}

export default function ComparisonTable() {
  const [activeMobileTier, setActiveMobileTier] = useState<0 | 1 | 2 | 3>(1);

  return (
    <section className="border-b border-app/40 bg-app-elevated">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <header className="max-w-2xl">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-tool-accent">
            Compare plans
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app sm:text-4xl">
            Everything in every plan, side by side.
          </h2>
          <p className="mt-3 text-sm text-secondary sm:text-base">
            All tiers ship with the full app catalogue. Higher tiers add more
            members, more storage, deeper admin controls, and tighter support.
          </p>
        </header>

        {/* Desktop table */}
        <div className="not-prose mt-10 hidden md:block">
          <div className="overflow-hidden rounded-2xl border border-app">
            {/* Header row */}
            <div
              className="sticky top-0 z-10 grid border-b border-app bg-app-elevated"
              style={{ gridTemplateColumns: "minmax(220px, 1.5fr) repeat(4, 1fr)" }}
            >
              <div className="px-5 py-4 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Feature
              </div>
              {TIER_NAMES.map((name, idx) => (
                <div
                  key={name}
                  className={
                    idx === 1
                      ? "px-5 py-4 text-center text-sm font-semibold text-tool-accent"
                      : "px-5 py-4 text-center text-sm font-semibold text-app"
                  }
                >
                  {name}
                  {idx === 1 && (
                    <span className="ml-2 rounded-full bg-tool-accent-soft px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-tool-accent">
                      Popular
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Groups */}
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div
                  className="grid border-b border-app/60 bg-surface/40"
                  style={{
                    gridTemplateColumns:
                      "minmax(220px, 1.5fr) repeat(4, 1fr)",
                  }}
                >
                  <div className="col-span-5 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tool-accent">
                    {group.title}
                  </div>
                </div>
                {group.rows.map((row, rowIdx) => (
                  <div
                    key={row.label}
                    className={
                      rowIdx === group.rows.length - 1
                        ? "grid"
                        : "grid border-b border-app/40"
                    }
                    style={{
                      gridTemplateColumns:
                        "minmax(220px, 1.5fr) repeat(4, 1fr)",
                    }}
                  >
                    <div className="px-5 py-4 text-sm text-secondary">
                      {row.label}
                      {row.hint && (
                        <span className="block text-xs text-muted">
                          {row.hint}
                        </span>
                      )}
                    </div>
                    {row.values.map((value, colIdx) => (
                      <div
                        key={colIdx}
                        className={
                          colIdx === 1
                            ? "flex items-center justify-center bg-tool-accent-soft/20 px-5 py-4"
                            : "flex items-center justify-center px-5 py-4"
                        }
                      >
                        {renderCell(value)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile accordion / tab switcher */}
        <div className="mt-10 md:hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TIER_NAMES.map((name, idx) => (
              <button
                key={name}
                type="button"
                onClick={() => setActiveMobileTier(idx as 0 | 1 | 2 | 3)}
                className={
                  activeMobileTier === idx
                    ? "shrink-0 rounded-full bg-tool-accent px-4 py-2 text-xs font-semibold text-white"
                    : "shrink-0 rounded-full border border-app bg-app-elevated px-4 py-2 text-xs font-semibold text-secondary transition-colors hover:text-app"
                }
              >
                {name}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-app bg-app-elevated">
            {GROUPS.map((group) => (
              <div key={group.title} className="border-b border-app/40 last:border-b-0">
                <div className="bg-surface/40 px-5 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-tool-accent">
                  {group.title}
                </div>
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 border-b border-app/40 px-5 py-4 last:border-b-0"
                  >
                    <div className="flex-1 text-sm text-secondary">
                      {row.label}
                      {row.hint && (
                        <span className="block text-xs text-muted">
                          {row.hint}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center justify-end">
                      {renderCell(row.values[activeMobileTier])}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
