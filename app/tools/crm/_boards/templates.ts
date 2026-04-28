/* ─────────────────────────────────────────────────────────────────────────
 * CRM Boards — board templates registry.
 * Pre-built starting points for the four "Monday-style" workflows that
 * don't fit our fixed CRM schema (sales pipeline already lives in deals;
 * contacts/companies/inventory/activities already exist). Each template
 * declares the columns + views to instantiate, plus optional sample
 * records so the user lands on a populated board.
 *
 * The "blank-board" entry is a special fall-through used when the user
 * picks "Blank board" in the gallery — handled in the API route, not here.
 * ───────────────────────────────────────────────────────────────────── */

import type {
  BoardColumnCreateBody,
  BoardKind,
  BoardRecordCreateBody,
  BoardViewCreateBody,
} from "./types";

export interface BoardTemplate {
  /** URL-safe id used by the gallery + POST /boards body. */
  id: string;
  name: string;
  description: string;
  kind: BoardKind;
  icon: string;
  color: string;
  /** Slug seed; the API falls back to the kebab-case of `name` if absent. */
  slug: string;
  columns: BoardColumnCreateBody[];
  views: BoardViewCreateBody[];
  /** Optional pre-populated rows. The API marks the board's description
   * with a "(includes sample data)" note when this is non-empty. */
  sampleRecords: BoardRecordCreateBody[];
}

// ─── status palettes shared across templates ───────────────────────────

const STATUS_GREY = "#6b7280";
const STATUS_BLUE = "#3b82f6";
const STATUS_GREEN = "#10b981";
const STATUS_YELLOW = "#f59e0b";
const STATUS_RED = "#ef4444";
const STATUS_PURPLE = "#8b5cf6";
const STATUS_TEAL = "#14b8a6";

// ─── 1. Marketing campaigns ────────────────────────────────────────────

const marketingCampaigns: BoardTemplate = {
  id: "marketing-campaigns",
  name: "Marketing campaigns",
  description:
    "Plan, schedule, and measure campaigns across every channel. Sample rows included so the board lands ready to edit.",
  kind: "marketing",
  icon: "broadcast",
  color: "#f59e0b",
  slug: "marketing-campaigns",
  columns: [
    {
      field_key: "name",
      label: "Campaign",
      field_type: "text",
      required: true,
      width: 240,
      position: 0,
    },
    {
      field_key: "channel",
      label: "Channel",
      field_type: "dropdown",
      config: {
        options: [
          { value: "email", label: "Email" },
          { value: "social", label: "Social" },
          { value: "search", label: "Search" },
          { value: "paid_ads", label: "Paid Ads" },
          { value: "pr", label: "PR" },
          { value: "event", label: "Event" },
          { value: "other", label: "Other" },
        ],
      },
      width: 140,
      position: 1,
    },
    {
      field_key: "status",
      label: "Status",
      field_type: "status",
      config: {
        options: [
          { value: "planned", label: "Planned", color: STATUS_GREY },
          { value: "live", label: "Live", color: STATUS_GREEN },
          { value: "paused", label: "Paused", color: STATUS_YELLOW },
          { value: "done", label: "Done", color: STATUS_BLUE },
        ],
      },
      width: 140,
      position: 2,
    },
    {
      field_key: "owner",
      label: "Owner",
      field_type: "person",
      width: 160,
      position: 3,
    },
    {
      field_key: "start_date",
      label: "Start",
      field_type: "date",
      width: 130,
      position: 4,
    },
    {
      field_key: "end_date",
      label: "End",
      field_type: "date",
      width: 130,
      position: 5,
    },
    {
      field_key: "budget",
      label: "Budget",
      field_type: "currency",
      config: { code: "USD", decimals: 0 },
      width: 130,
      position: 6,
    },
    {
      field_key: "spent",
      label: "Spent",
      field_type: "currency",
      config: { code: "USD", decimals: 0 },
      width: 130,
      position: 7,
    },
    {
      field_key: "leads_generated",
      label: "Leads",
      field_type: "number",
      width: 100,
      position: 8,
    },
    {
      field_key: "notes",
      label: "Notes",
      field_type: "longtext",
      width: 280,
      position: 9,
    },
  ],
  views: [
    { name: "All campaigns", view_type: "table", is_default: true, position: 0 },
    {
      name: "By status",
      view_type: "kanban",
      config: { group_by: "status" },
      position: 1,
    },
    {
      name: "Calendar",
      view_type: "calendar",
      config: { date_field: "start_date" },
      position: 2,
    },
  ],
  sampleRecords: [
    {
      data: {
        name: "Spring launch — newsletter blast",
        channel: "email",
        status: "live",
        start_date: "2026-04-01",
        end_date: "2026-04-30",
        budget: 2500,
        spent: 1100,
        leads_generated: 38,
        notes: "Sample row.",
      },
      position: 0,
    },
    {
      data: {
        name: "LinkedIn thought-leadership push",
        channel: "social",
        status: "planned",
        start_date: "2026-05-05",
        end_date: "2026-06-05",
        budget: 800,
        spent: 0,
        leads_generated: 0,
        notes: "Sample row.",
      },
      position: 1,
    },
    {
      data: {
        name: "Google Ads — branded keywords",
        channel: "paid_ads",
        status: "live",
        start_date: "2026-03-15",
        end_date: "2026-12-31",
        budget: 12000,
        spent: 4250,
        leads_generated: 92,
        notes: "Sample row.",
      },
      position: 2,
    },
  ],
};

// ─── 2. Projects ───────────────────────────────────────────────────────

const projects: BoardTemplate = {
  id: "projects",
  name: "Projects",
  description:
    "Track every project across the team. Group by status for a kanban; switch to timeline for delivery dates.",
  kind: "projects",
  icon: "kanban",
  color: "#10b981",
  slug: "projects",
  columns: [
    {
      field_key: "name",
      label: "Project",
      field_type: "text",
      required: true,
      width: 260,
      position: 0,
    },
    {
      field_key: "owner",
      label: "Owner",
      field_type: "person",
      width: 160,
      position: 1,
    },
    {
      field_key: "status",
      label: "Status",
      field_type: "status",
      config: {
        options: [
          { value: "not_started", label: "Not started", color: STATUS_GREY },
          { value: "in_progress", label: "In progress", color: STATUS_BLUE },
          { value: "blocked", label: "Blocked", color: STATUS_RED },
          { value: "done", label: "Done", color: STATUS_GREEN },
        ],
      },
      width: 150,
      position: 2,
    },
    {
      field_key: "priority",
      label: "Priority",
      field_type: "status",
      config: {
        options: [
          { value: "low", label: "Low", color: STATUS_GREY },
          { value: "medium", label: "Medium", color: STATUS_BLUE },
          { value: "high", label: "High", color: STATUS_YELLOW },
          { value: "critical", label: "Critical", color: STATUS_RED },
        ],
      },
      width: 130,
      position: 3,
    },
    {
      field_key: "start_date",
      label: "Start",
      field_type: "date",
      width: 130,
      position: 4,
    },
    {
      field_key: "due_date",
      label: "Due",
      field_type: "date",
      width: 130,
      position: 5,
    },
    {
      field_key: "completion",
      label: "Complete",
      field_type: "percent",
      config: { decimals: 0 },
      width: 120,
      position: 6,
    },
    {
      field_key: "files",
      label: "Files",
      field_type: "file",
      width: 140,
      position: 7,
    },
  ],
  views: [
    { name: "All projects", view_type: "table", is_default: true, position: 0 },
    {
      name: "By status",
      view_type: "kanban",
      config: { group_by: "status" },
      position: 1,
    },
    {
      name: "Timeline",
      view_type: "timeline",
      config: { date_field: "start_date", end_date_field: "due_date" },
      position: 2,
    },
  ],
  sampleRecords: [],
};

// ─── 3. Customer onboarding ────────────────────────────────────────────

const customerOnboarding: BoardTemplate = {
  id: "customer-onboarding",
  name: "Customer onboarding",
  description:
    "Walk every new customer from welcome to live. Track health, owner, and where they are in the flow.",
  kind: "onboarding",
  icon: "users",
  color: "#0ea5e9",
  slug: "customer-onboarding",
  columns: [
    {
      field_key: "name",
      label: "Customer",
      field_type: "text",
      required: true,
      width: 220,
      position: 0,
    },
    {
      field_key: "stage",
      label: "Stage",
      field_type: "status",
      config: {
        options: [
          { value: "welcome", label: "Welcome", color: STATUS_GREY },
          { value: "setup", label: "Setup", color: STATUS_BLUE },
          { value: "training", label: "Training", color: STATUS_PURPLE },
          { value: "live", label: "Live", color: STATUS_GREEN },
        ],
      },
      width: 140,
      position: 1,
    },
    {
      field_key: "assignee",
      label: "Assignee",
      field_type: "person",
      width: 160,
      position: 2,
    },
    {
      field_key: "kickoff_date",
      label: "Kickoff",
      field_type: "date",
      width: 130,
      position: 3,
    },
    {
      field_key: "go_live_date",
      label: "Go-live",
      field_type: "date",
      width: 130,
      position: 4,
    },
    {
      field_key: "tasks_total",
      label: "Tasks",
      field_type: "number",
      width: 100,
      position: 5,
    },
    {
      field_key: "tasks_done",
      label: "Done",
      field_type: "number",
      width: 100,
      position: 6,
    },
    {
      field_key: "health",
      label: "Health",
      field_type: "status",
      config: {
        options: [
          { value: "at_risk", label: "At risk", color: STATUS_RED },
          { value: "watch", label: "Watch", color: STATUS_YELLOW },
          { value: "healthy", label: "Healthy", color: STATUS_GREEN },
        ],
      },
      width: 130,
      position: 7,
    },
    {
      field_key: "notes",
      label: "Notes",
      field_type: "longtext",
      width: 280,
      position: 8,
    },
  ],
  views: [
    {
      name: "All customers",
      view_type: "table",
      is_default: true,
      position: 0,
    },
    {
      name: "By stage",
      view_type: "kanban",
      config: { group_by: "stage" },
      position: 1,
    },
  ],
  sampleRecords: [],
};

// ─── 4. Accounts ───────────────────────────────────────────────────────

const accounts: BoardTemplate = {
  id: "accounts",
  name: "Accounts",
  description:
    "Manage post-sale accounts, renewals, and NPS. Spot at-risk customers before they churn.",
  kind: "accounts",
  icon: "building",
  color: "#6366f1",
  slug: "accounts",
  columns: [
    {
      field_key: "name",
      label: "Account",
      field_type: "text",
      required: true,
      width: 220,
      position: 0,
    },
    {
      field_key: "tier",
      label: "Tier",
      field_type: "status",
      config: {
        options: [
          { value: "free", label: "Free", color: STATUS_GREY },
          { value: "pro", label: "Pro", color: STATUS_BLUE },
          { value: "team", label: "Team", color: STATUS_PURPLE },
          { value: "enterprise", label: "Enterprise", color: STATUS_TEAL },
        ],
      },
      width: 130,
      position: 1,
    },
    {
      field_key: "owner",
      label: "Owner",
      field_type: "person",
      width: 160,
      position: 2,
    },
    {
      field_key: "arr",
      label: "ARR",
      field_type: "currency",
      config: { code: "USD", decimals: 0 },
      width: 140,
      position: 3,
    },
    {
      field_key: "renewal_date",
      label: "Renewal",
      field_type: "date",
      width: 130,
      position: 4,
    },
    {
      field_key: "nps",
      label: "NPS",
      field_type: "rating",
      config: { max: 10 },
      width: 140,
      position: 5,
    },
    {
      field_key: "last_touch",
      label: "Last touch",
      field_type: "date",
      width: 130,
      position: 6,
    },
    {
      field_key: "status",
      label: "Status",
      field_type: "status",
      config: {
        options: [
          { value: "active", label: "Active", color: STATUS_GREEN },
          { value: "at_risk", label: "At risk", color: STATUS_RED },
          { value: "churned", label: "Churned", color: STATUS_GREY },
          { value: "champion", label: "Champion", color: STATUS_PURPLE },
        ],
      },
      width: 140,
      position: 7,
    },
    {
      field_key: "notes",
      label: "Notes",
      field_type: "longtext",
      width: 280,
      position: 8,
    },
  ],
  views: [
    { name: "All accounts", view_type: "table", is_default: true, position: 0 },
    {
      name: "By status",
      view_type: "kanban",
      config: { group_by: "status" },
      position: 1,
    },
  ],
  sampleRecords: [],
};

// ─── registry ──────────────────────────────────────────────────────────

export const BOARD_TEMPLATES: BoardTemplate[] = [
  marketingCampaigns,
  projects,
  customerOnboarding,
  accounts,
];

export function getBoardTemplate(id: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find((t) => t.id === id);
}
