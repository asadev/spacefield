import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * GET /developers/openapi.json — minimal OpenAPI 3.1 spec for the
 * public /api/v1/* surface.
 *
 * Hand-rolled because we ship only seven routes — running a generator
 * would be more code than the spec itself. Keep this file in sync with
 * the actual route handlers and with `app/developers/page.tsx`.
 */

const SECURITY_SCHEME = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    description:
      "Mint a token at /admin/api-tokens. Pass it on every request as "
      + "`Authorization: Bearer <token>`. Tokens are scoped to a single "
      + "workspace.",
  },
} as const;

const COMMON_PARAMS = [
  {
    name: "limit",
    in: "query",
    description: "Page size. Default 50, max 100.",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "cursor",
    in: "query",
    description:
      "Id of the last row from the previous page. Omit on the first call.",
    required: false,
    schema: { type: "string" },
  },
];

const ERROR_RESPONSES = {
  "401": {
    description:
      "Missing, invalid, expired, or revoked bearer token.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "403": {
    description:
      "Token does not carry the required scope, or has no workspace assigned.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "429": {
    description: "Rate limit exceeded (600 req/min per token).",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
} as const;

function listOp(opts: {
  tag: string;
  scope: string;
  description: string;
  rowSchemaRef: string;
  extraParams?: Array<Record<string, unknown>>;
}) {
  return {
    tags: [opts.tag],
    summary: `List ${opts.tag.toLowerCase()}`,
    description: opts.description,
    security: [{ bearerAuth: [opts.scope] }],
    parameters: [...COMMON_PARAMS, ...(opts.extraParams ?? [])],
    responses: {
      "200": {
        description: "Paginated list of rows.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data", "next_cursor"],
              properties: {
                data: {
                  type: "array",
                  items: { $ref: opts.rowSchemaRef },
                },
                next_cursor: {
                  type: ["string", "null"],
                  description:
                    "Pass back as `?cursor=` to fetch the next page. "
                    + "`null` when the page is the last one.",
                },
              },
            },
          },
        },
      },
      ...ERROR_RESPONSES,
    },
  };
}

function getByIdOp(opts: {
  tag: string;
  scope: string;
  rowSchemaRef: string;
}) {
  return {
    tags: [opts.tag],
    summary: `Get one ${opts.tag.toLowerCase().replace(/s$/, "")}`,
    security: [{ bearerAuth: [opts.scope] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "The requested row.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data"],
              properties: { data: { $ref: opts.rowSchemaRef } },
            },
          },
        },
      },
      "404": {
        description: "Not found in the caller's workspace.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      ...ERROR_RESPONSES,
    },
  };
}

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Space Field Public API",
    version: "1.0.0",
    description:
      "Read-only access to your Space Field workspace. Bearer-token "
      + "authenticated, workspace-scoped, rate-limited at 600 req/min.",
  },
  servers: [{ url: "https://spacefield.co", description: "Production" }],
  tags: [
    { name: "Tasks" },
    { name: "Projects" },
    { name: "Contacts" },
    { name: "Deals" },
    { name: "Employees" },
  ],
  components: {
    securitySchemes: SECURITY_SCHEME,
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          detail: { type: "string" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          project_id: { type: ["string", "null"], format: "uuid" },
          parent_task_id: { type: ["string", "null"], format: "uuid" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          status: { type: "string" },
          priority: { type: "string" },
          assignee_ids: { type: "array", items: { type: "string" } },
          due_at: { type: ["string", "null"], format: "date-time" },
          start_at: { type: ["string", "null"], format: "date-time" },
          completed_at: { type: ["string", "null"], format: "date-time" },
          estimate_min: { type: ["integer", "null"] },
          actual_min: { type: ["integer", "null"] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: ["string", "null"] },
          status: { type: "string" },
          color: { type: ["string", "null"] },
          icon: { type: ["string", "null"] },
          created_by: { type: ["string", "null"], format: "uuid" },
          archived_at: { type: ["string", "null"], format: "date-time" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Contact: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          first_name: { type: ["string", "null"] },
          last_name: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          job_title: { type: ["string", "null"] },
          company_id: { type: ["string", "null"], format: "uuid" },
          notes: { type: ["string", "null"] },
          visibility: { type: "string" },
          owner_id: { type: ["string", "null"], format: "uuid" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Deal: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          pipeline_id: { type: "string", format: "uuid" },
          stage_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          amount: { type: ["number", "null"] },
          currency: { type: "string" },
          close_date: { type: ["string", "null"], format: "date" },
          primary_contact_id: { type: ["string", "null"], format: "uuid" },
          company_id: { type: ["string", "null"], format: "uuid" },
          assignee_ids: { type: "array", items: { type: "string" } },
          position: { type: "integer" },
          visibility: { type: "string" },
          owner_id: { type: ["string", "null"], format: "uuid" },
          status: { type: "string", enum: ["open", "won", "lost"] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
          closed_at: { type: ["string", "null"], format: "date-time" },
        },
      },
      Employee: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          user_id: { type: ["string", "null"], format: "uuid" },
          email: { type: ["string", "null"] },
          full_name: { type: "string" },
          job_title: { type: ["string", "null"] },
          department: { type: ["string", "null"] },
          manager_id: { type: ["string", "null"], format: "uuid" },
          location: { type: ["string", "null"] },
          employment_type: { type: "string" },
          hire_date: { type: ["string", "null"], format: "date" },
          termination_date: { type: ["string", "null"], format: "date" },
          status: { type: "string" },
          archived_at: { type: ["string", "null"], format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/api/v1/tasks": {
      get: listOp({
        tag: "Tasks",
        scope: "read:tasks",
        description:
          "List tasks in the token's workspace. Soft-deleted rows are excluded.",
        rowSchemaRef: "#/components/schemas/Task",
        extraParams: [
          {
            name: "project_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
      }),
    },
    "/api/v1/tasks/{id}": {
      get: getByIdOp({
        tag: "Tasks",
        scope: "read:tasks",
        rowSchemaRef: "#/components/schemas/Task",
      }),
    },
    "/api/v1/projects": {
      get: listOp({
        tag: "Projects",
        scope: "read:projects",
        description: "List projects in the token's workspace.",
        rowSchemaRef: "#/components/schemas/Project",
        extraParams: [
          { name: "status", in: "query", schema: { type: "string" } },
        ],
      }),
    },
    "/api/v1/projects/{id}": {
      get: getByIdOp({
        tag: "Projects",
        scope: "read:projects",
        rowSchemaRef: "#/components/schemas/Project",
      }),
    },
    "/api/v1/contacts": {
      get: listOp({
        tag: "Contacts",
        scope: "read:contacts",
        description: "List CRM contacts in the token's workspace.",
        rowSchemaRef: "#/components/schemas/Contact",
        extraParams: [
          {
            name: "company_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "q",
            in: "query",
            description: "Email substring filter (case-insensitive).",
            schema: { type: "string" },
          },
        ],
      }),
    },
    "/api/v1/deals": {
      get: listOp({
        tag: "Deals",
        scope: "read:deals",
        description: "List CRM deals in the token's workspace.",
        rowSchemaRef: "#/components/schemas/Deal",
        extraParams: [
          {
            name: "pipeline_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "stage_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["open", "won", "lost"] },
          },
        ],
      }),
    },
    "/api/v1/employees": {
      get: listOp({
        tag: "Employees",
        scope: "read:employees",
        description: "List employees in the token's workspace.",
        rowSchemaRef: "#/components/schemas/Employee",
        extraParams: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "department", in: "query", schema: { type: "string" } },
        ],
      }),
    },
  },
} as const;

export function GET() {
  return NextResponse.json(SPEC, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
