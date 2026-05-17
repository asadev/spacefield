import ReportsClient, {
  type ReportTableSpec,
} from "./_components/ReportsClient";

export const dynamic = "force-dynamic";

/**
 * Cross-tool reports — pick a table, pick a column to group by, pick
 * an aggregation, see an SVG bar chart. The spec list below mirrors
 * the column allow-list in `_components/_actions.ts`; the two MUST
 * stay in sync (the server action rejects anything not in its
 * `COL_ALLOW`, which is the security boundary).
 */
export default function AdminReportsPage() {
  const specs: ReportTableSpec[] = [
    {
      label: "Tasks",
      table: "tasks",
      groupBy: [
        { name: "status", label: "Status" },
        { name: "priority", label: "Priority" },
        { name: "project_id", label: "Project" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [
        { name: "estimate_min", label: "Estimate (min)" },
        { name: "actual_min", label: "Actual (min)" },
      ],
    },
    {
      label: "Projects",
      table: "projects",
      groupBy: [
        { name: "status", label: "Status" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "CRM — Deals",
      table: "crm_deals",
      groupBy: [
        { name: "status", label: "Status" },
        { name: "stage_id", label: "Stage" },
        { name: "pipeline_id", label: "Pipeline" },
        { name: "currency", label: "Currency" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [{ name: "amount", label: "Amount" }],
    },
    {
      label: "CRM — Leads",
      table: "crm_leads",
      groupBy: [
        { name: "status", label: "Status" },
        { name: "source", label: "Source" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "CRM — Contacts",
      table: "crm_contacts",
      groupBy: [
        { name: "job_title", label: "Job title" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "CRM — Companies",
      table: "crm_companies",
      groupBy: [
        { name: "industry", label: "Industry" },
        { name: "country", label: "Country" },
        { name: "city", label: "City" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "CRM — Activities",
      table: "crm_activities",
      groupBy: [
        { name: "kind", label: "Kind" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "Employees",
      table: "employees",
      groupBy: [
        { name: "department", label: "Department" },
        { name: "status", label: "Status" },
        { name: "employment_type", label: "Employment type" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "Workflows (V2)",
      table: "workflows",
      groupBy: [
        { name: "trigger_kind", label: "Trigger kind" },
        { name: "enabled", label: "Enabled" },
        { name: "workspace_id", label: "Workspace" },
      ],
      numeric: [],
    },
    {
      label: "Workspace templates",
      table: "workspace_templates",
      groupBy: [
        { name: "industry", label: "Industry" },
        { name: "enabled", label: "Enabled" },
      ],
      numeric: [],
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Data & Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Cross-tool reports
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick a table, a column to group by, and an aggregation. The
          chart renders client-side as SVG (no chart library). For ad-hoc
          analysis only — use `/admin/database` for raw SQL.
        </p>
      </div>
      <ReportsClient specs={specs} />
    </div>
  );
}
