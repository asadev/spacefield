/**
 * People (HR) module shared types.
 *
 * Mirrors the columns in supabase/migrations/20260514e_people.sql.
 * No runtime code here — pure types so server and client code can share.
 */

export type EmploymentType = "full_time" | "part_time" | "contractor" | "intern";
export type EmployeeStatus = "active" | "on_leave" | "terminated";

export interface Employee {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string | null;
  full_name: string;
  job_title: string | null;
  department: string | null;
  manager_id: string | null;
  location: string | null;
  employment_type: EmploymentType;
  hire_date: string | null;
  termination_date: string | null;
  status: EmployeeStatus;
  custom: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TimeOffKind =
  | "pto"
  | "sick"
  | "unpaid"
  | "parental"
  | "custom";

export interface TimeOffPolicy {
  id: string;
  workspace_id: string;
  name: string;
  kind: TimeOffKind;
  accrual_per_year_days: number;
  carryover_max: number | null;
  cap: number | null;
  active: boolean;
  created_at: string;
}

export interface TimeOffBalance {
  id: string;
  workspace_id: string;
  employee_id: string;
  policy_id: string;
  balance_days: number;
  as_of: string;
}

export type TimeOffRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "cancelled";

export interface TimeOffRequest {
  id: string;
  workspace_id: string;
  employee_id: string;
  policy_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: TimeOffRequestStatus;
  approved_by: string | null;
  decided_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface OnboardingTaskTemplate {
  title: string;
  owner_role?: string;
  due_day_offset?: number;
  description?: string;
}

export interface OnboardingTemplate {
  id: string;
  workspace_id: string;
  name: string;
  tasks: OnboardingTaskTemplate[];
  created_at: string;
}

export interface OnboardingTaskState {
  title: string;
  done: boolean;
  done_by?: string | null;
  done_at?: string | null;
  due_at?: string | null;
  description?: string;
}

export interface OnboardingRun {
  id: string;
  workspace_id: string;
  employee_id: string;
  template_id: string | null;
  tasks_state: OnboardingTaskState[];
  started_at: string;
  completed_at: string | null;
}

export type EmployeeDocumentKind =
  | "emirates_id"
  | "visa"
  | "passport"
  | "contract"
  | "certification"
  | "other";

export interface EmployeeDocument {
  id: string;
  workspace_id: string;
  employee_id: string;
  kind: EmployeeDocumentKind;
  name: string;
  file_url: string | null;
  /**
   * SC-005: the plaintext `number` column is wiped on write/migration.
   * Read code MUST treat it as opaque/null and rely on `number_last4`
   * for masked display, or call the reveal RPC for the full value
   * after HR-role / owner gating.
   */
  number: string | null;
  number_last4: string | null;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ExpiringDocRow {
  id: string;
  workspace_id: string;
  employee_id: string;
  employee_name: string;
  kind: string;
  name: string;
  /**
   * SC-005: plaintext `number` is no longer returned by the
   * expiring_docs RPC. Kept here only so old callers that reference
   * the field compile against null; new code should use
   * `number_last4` + `revealDocNumber` (HR-gated).
   */
  number?: string | null;
  number_last4: string | null;
  expires_at: string;
  days_left: number;
}

/** A simple node used to render the org chart on the server. */
export interface OrgNode {
  employee: Pick<
    Employee,
    "id" | "full_name" | "job_title" | "department" | "status"
  >;
  children: OrgNode[];
}
