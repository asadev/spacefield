import Link from "next/link";

import { CodeBlock } from "./_components/CodeBlock";

export const metadata = {
  title: "Developers — Space Field API",
  description:
    "Programmatic access to your Space Field workspace via the public v1 API.",
};

// API docs change with deploys; 5-minute ISR is fine.
export const revalidate = 300;

/**
 * /developers — public docs landing for the public v1 API.
 *
 * Intentionally plain Tailwind, no marketing chrome. Each endpoint
 * collapses into a <details> block so the page stays scannable.
 */

type Endpoint = {
  method: string;
  path: string;
  scope: string;
  summary: string;
  curl: string;
};

const BASE = "https://spacefield.co";

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/tasks",
    scope: "read:tasks",
    summary:
      "List tasks in the token's workspace. Supports project_id, status filters.",
    curl: `curl -sS "${BASE}/api/v1/tasks?limit=25" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/tasks/{id}",
    scope: "read:tasks",
    summary: "Fetch one task by id. 404 if the task isn't in your workspace.",
    curl: `curl -sS "${BASE}/api/v1/tasks/<uuid>" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/projects",
    scope: "read:projects",
    summary: "List projects. Supports status filter.",
    curl: `curl -sS "${BASE}/api/v1/projects?limit=25" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/projects/{id}",
    scope: "read:projects",
    summary: "Fetch one project by id.",
    curl: `curl -sS "${BASE}/api/v1/projects/<uuid>" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/contacts",
    scope: "read:contacts",
    summary:
      "List CRM contacts. Supports company_id and q (email substring) filters.",
    curl: `curl -sS "${BASE}/api/v1/contacts?limit=25" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/deals",
    scope: "read:deals",
    summary:
      "List CRM deals. Supports pipeline_id, stage_id, status (open|won|lost) filters.",
    curl: `curl -sS "${BASE}/api/v1/deals?limit=25&status=open" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
  {
    method: "GET",
    path: "/api/v1/employees",
    scope: "read:employees",
    summary:
      "List employees. Supports status and department filters.",
    curl: `curl -sS "${BASE}/api/v1/employees?limit=25" \\
  -H "Authorization: Bearer $SPACEFIELD_TOKEN"`,
  },
];

const SCOPES: Array<{ name: string; description: string }> = [
  { name: "read:tasks", description: "List + read tasks in the workspace." },
  { name: "read:projects", description: "List + read projects." },
  { name: "read:contacts", description: "List + read CRM contacts." },
  { name: "read:deals", description: "List + read CRM deals." },
  { name: "read:employees", description: "List + read employee records." },
  {
    name: "read:all",
    description:
      "Wildcard — satisfies every `read:*` scope. Use sparingly; prefer narrow grants.",
  },
];

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-app text-app">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10 border-b border-app pb-8">
          <Link
            href="/"
            className="text-[0.6rem] uppercase tracking-[0.25em] text-faint hover:text-app"
          >
            ← Space Field
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Developers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            Programmatic, read-only access to your workspace data over a small
            REST API. Bearer-token authenticated, JSON in/JSON out, workspace
            scoping baked in. Stable surface — versioned under{" "}
            <code className="text-app">/api/v1</code>.
          </p>
          <p className="mt-3 text-xs text-faint">
            OpenAPI 3.1 spec:{" "}
            <Link
              href="/developers/openapi.json"
              className="text-app underline-offset-2 hover:underline"
            >
              /developers/openapi.json
            </Link>
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-2 text-lg font-medium">1. Authentication</h2>
          <p className="text-sm text-secondary">
            Mint a token from{" "}
            <Link
              href="/admin/api-tokens"
              className="text-app underline-offset-2 hover:underline"
            >
              /admin/api-tokens
            </Link>{" "}
            (admins only). Pick the workspace the token should be scoped to
            and tick the scopes you need. The token value is shown exactly
            once — store it like a password.
          </p>
          <p className="mt-3 text-sm text-secondary">
            Pass it on every request:
          </p>
          <CodeBlock
            language="http"
            code={`GET /api/v1/tasks HTTP/1.1
Host: spacefield.co
Authorization: Bearer sf_xxxxxxxxxxxxxxxx`}
          />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-secondary">
            <li>
              <strong>401</strong> — missing or invalid token, or token
              expired / revoked.
            </li>
            <li>
              <strong>403</strong> — token is valid but missing the scope the
              endpoint requires, or has no workspace assigned.
            </li>
            <li>
              <strong>404</strong> — entity not in your workspace.
            </li>
            <li>
              <strong>429</strong> — rate limit exceeded (see below).
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-2 text-lg font-medium">2. Scopes</h2>
          <p className="text-sm text-secondary">
            Each endpoint requires exactly one scope. Wildcards are honoured
            but discouraged — prefer the narrowest grant per token.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-app">
            <table className="w-full text-left text-xs">
              <thead className="bg-app-elevated text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium uppercase tracking-[0.15em]">
                    Scope
                  </th>
                  <th className="px-3 py-2 font-medium uppercase tracking-[0.15em]">
                    What it grants
                  </th>
                </tr>
              </thead>
              <tbody>
                {SCOPES.map((s) => (
                  <tr key={s.name} className="border-t border-app">
                    <td className="px-3 py-2 font-mono text-app">{s.name}</td>
                    <td className="px-3 py-2 text-secondary">
                      {s.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-2 text-lg font-medium">3. Rate limits</h2>
          <p className="text-sm text-secondary">
            Every endpoint is bucketed at{" "}
            <strong className="text-app">600 requests per 60 seconds</strong>{" "}
            per token. Exceeding the bucket returns{" "}
            <code className="text-app">429</code> with a{" "}
            <code className="text-app">Retry-After</code> header.
          </p>
          <p className="mt-3 text-xs text-secondary">
            For sustained higher throughput, open a ticket — we can mint
            elevated tokens on request.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-2 text-lg font-medium">4. Pagination</h2>
          <p className="text-sm text-secondary">
            List endpoints accept <code>?limit=</code> (default 50, max 100)
            and <code>?cursor=</code> (the last id from the previous page).
            Responses are shaped:
          </p>
          <CodeBlock
            language="json"
            code={`{
  "data": [ /* row, row, row ... */ ],
  "next_cursor": "0c47e5a4-..."
}`}
          />
          <p className="mt-2 text-xs text-secondary">
            When <code>next_cursor</code> is <code>null</code>, you've reached
            the end of the result set.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="mb-3 text-lg font-medium">5. Endpoints</h2>
          <p className="mb-4 text-xs text-secondary">
            Click an endpoint to expand its curl example.
          </p>
          <div className="space-y-2">
            {ENDPOINTS.map((ep) => (
              <details
                key={`${ep.method} ${ep.path}`}
                className="rounded-lg border border-app bg-app-elevated"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="inline-block min-w-12 rounded bg-app px-2 py-0.5 text-center font-mono text-[0.65rem] uppercase tracking-[0.15em] text-app">
                      {ep.method}
                    </span>
                    <code className="font-mono text-app">{ep.path}</code>
                  </span>
                  <span className="text-xs text-faint">
                    requires{" "}
                    <code className="text-app">{ep.scope}</code>
                  </span>
                </summary>
                <div className="border-t border-app px-4 py-3">
                  <p className="text-xs text-secondary">{ep.summary}</p>
                  <CodeBlock language="bash" code={ep.curl} />
                </div>
              </details>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-app pt-6 text-xs text-faint">
          The v1 surface is read-only. Write endpoints will arrive in a future
          version — they will live under <code>/api/v1</code> alongside the
          read endpoints and never replace them.
        </footer>
      </div>
    </main>
  );
}
