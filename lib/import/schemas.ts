/* ─────────────────────────────────────────────────────────────────────────
 * Universal CSV import — per-entity column schemas.
 *
 * Each entity declares the target fields a row can fill. The wizard reads
 * the user's CSV headers, tries to auto-match them by alias, then runs the
 * row values through `validate()` before posting to the entity importer.
 *
 * Adding a new entity here is the *only* place that defines what fields
 * are supported — the UI, validator, and server importer are all driven
 * by this table.
 * ───────────────────────────────────────────────────────────────────── */

export type ImportColumnType =
  | "string"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "enum";

export interface ImportColumn {
  /** Target field name on the entity row. */
  name: string;
  /** Human-friendly label shown in the mapping dropdown + preview header. */
  label: string;
  type: ImportColumnType;
  required?: boolean;
  /** Allowed values when `type === "enum"`. */
  enum?: readonly string[];
  /**
   * Lowercase header strings that should auto-map to this column.
   * Include common spelling variants (US/UK, with/without spaces, hyphens).
   */
  aliases: readonly string[];
  /** Optional extra validation beyond the type. Returns error or null. */
  validate?: (value: string) => string | null;
}

export type EntityKey = "contacts" | "leads" | "employees" | "tasks";

export const ENTITY_KEYS: readonly EntityKey[] = [
  "contacts",
  "leads",
  "employees",
  "tasks",
] as const;

export function isEntityKey(v: string): v is EntityKey {
  return (ENTITY_KEYS as readonly string[]).includes(v);
}

export const ENTITY_LABELS: Record<EntityKey, string> = {
  contacts: "Contacts",
  leads: "Leads",
  employees: "Employees",
  tasks: "Tasks",
};

export const ENTITY_BLURBS: Record<EntityKey, string> = {
  contacts:
    "People in your CRM — buyers, sellers, partners. Import a CSV from another CRM or a spreadsheet of leads you've collected.",
  leads:
    "Inbound prospects that aren't qualified contacts yet. Useful for a one-shot list from a campaign or event.",
  employees: "Your team. Names, titles, departments, hire dates.",
  tasks: "To-dos with optional due dates, priorities, and statuses.",
};

export const SCHEMAS: Record<EntityKey, readonly ImportColumn[]> = {
  contacts: [
    {
      name: "full_name",
      label: "Full name",
      type: "string",
      required: true,
      aliases: ["full name", "name", "contact name", "fullname"],
    },
    {
      name: "first_name",
      label: "First name",
      type: "string",
      aliases: ["first name", "firstname", "given name", "first"],
    },
    {
      name: "last_name",
      label: "Last name",
      type: "string",
      aliases: ["last name", "lastname", "surname", "family name", "last"],
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      aliases: ["email", "e-mail", "email address", "mail"],
    },
    {
      name: "phone",
      label: "Phone",
      type: "phone",
      aliases: ["phone", "mobile", "tel", "telephone", "phone number", "cell"],
    },
    {
      name: "company",
      label: "Company",
      type: "string",
      aliases: ["company", "organisation", "organization", "org", "employer"],
    },
    {
      name: "title",
      label: "Job title",
      type: "string",
      aliases: ["title", "role", "position", "job title", "job"],
    },
    {
      name: "notes",
      label: "Notes",
      type: "string",
      aliases: ["notes", "comments", "note", "remark", "remarks"],
    },
  ],
  leads: [
    {
      name: "full_name",
      label: "Full name",
      type: "string",
      required: true,
      aliases: ["full name", "name", "lead name", "fullname"],
    },
    {
      name: "first_name",
      label: "First name",
      type: "string",
      aliases: ["first name", "firstname", "first"],
    },
    {
      name: "last_name",
      label: "Last name",
      type: "string",
      aliases: ["last name", "lastname", "surname", "last"],
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      aliases: ["email", "e-mail", "email address"],
    },
    {
      name: "phone",
      label: "Phone",
      type: "phone",
      aliases: ["phone", "mobile", "tel"],
    },
    {
      name: "source",
      label: "Source",
      type: "string",
      aliases: ["source", "lead source", "channel", "origin"],
    },
    {
      name: "status",
      label: "Status",
      type: "enum",
      enum: ["new", "working", "qualified", "disqualified", "converted"],
      aliases: ["status", "stage", "state"],
    },
    {
      name: "notes",
      label: "Notes",
      type: "string",
      aliases: ["notes", "comments", "note"],
    },
  ],
  employees: [
    {
      name: "full_name",
      label: "Full name",
      type: "string",
      required: true,
      aliases: ["full name", "name", "employee name", "fullname"],
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      aliases: ["email", "work email", "e-mail", "email address"],
    },
    {
      name: "job_title",
      label: "Job title",
      type: "string",
      aliases: ["title", "job title", "position", "role"],
    },
    {
      name: "department",
      label: "Department",
      type: "string",
      aliases: ["department", "team", "dept", "division"],
    },
    {
      name: "location",
      label: "Location",
      type: "string",
      aliases: ["location", "office", "city", "based in"],
    },
    {
      name: "hire_date",
      label: "Hire date",
      type: "date",
      aliases: ["hire date", "start date", "joined", "joining date", "doj"],
    },
    {
      name: "employment_type",
      label: "Employment type",
      type: "enum",
      enum: ["full_time", "part_time", "contractor", "intern"],
      aliases: [
        "type",
        "employment type",
        "employment",
        "contract type",
      ],
    },
  ],
  tasks: [
    {
      name: "title",
      label: "Title",
      type: "string",
      required: true,
      aliases: ["title", "task", "name", "task name", "subject"],
    },
    {
      name: "description",
      label: "Description",
      type: "string",
      aliases: ["description", "notes", "details", "body"],
    },
    {
      name: "status",
      label: "Status",
      type: "string",
      aliases: ["status", "state"],
    },
    {
      name: "priority",
      label: "Priority",
      type: "enum",
      enum: ["urgent", "high", "normal", "low"],
      aliases: ["priority", "importance"],
    },
    {
      name: "due_at",
      label: "Due date",
      type: "date",
      aliases: ["due", "due date", "deadline", "due_at", "due on"],
    },
  ],
};

/**
 * Find a schema column by name. Returns null if the name doesn't match.
 * Used by the validator + importers to look up the original column type.
 */
export function getColumn(
  entity: EntityKey,
  name: string
): ImportColumn | null {
  const cols = SCHEMAS[entity];
  return cols.find((c) => c.name === name) ?? null;
}
