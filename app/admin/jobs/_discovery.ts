import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Filesystem + vercel.json scanning helpers for the "discovered, not
 * registered" panel on `/admin/jobs`.
 *
 * - `discoverCronRoutes()` walks `app/api/cron/**` looking for
 *   `route.ts`/`route.tsx`/`route.js` files and returns the URL path
 *   each handler responds to (e.g., `/api/cron/social-publish`). The job
 *   id we suggest is the last URL segment.
 * - `readVercelCrons()` reads `vercel.json` from the project root and
 *   returns the `crons` array as a map of path → schedule. Used to seed
 *   the schedule field when an admin clicks "Register".
 *
 * Both are best-effort and never throw — a missing file just yields an
 * empty result.
 */

export interface DiscoveredRoute {
  /** Suggested cron_jobs.id (last URL segment). */
  id: string;
  /** URL path the handler serves: `/api/cron/<...>` */
  path: string;
  /** Absolute filesystem path to the route file (for display). */
  filePath: string;
}

const ROUTE_FILE_NAMES = new Set(["route.ts", "route.tsx", "route.js"]);

async function projectRoot(): Promise<string> {
  // Server actions run with cwd = the Next project root in production.
  // In local dev the same is true. process.cwd() is the cleanest answer.
  return process.cwd();
}

export async function discoverCronRoutes(): Promise<DiscoveredRoute[]> {
  const root = await projectRoot();
  const cronRoot = path.join(root, "app", "api", "cron");
  let entries: { absDir: string; relSegments: string[] }[];
  try {
    entries = await walkDirsContainingRoute(cronRoot, []);
  } catch {
    return [];
  }
  return entries
    .map((e) => {
      const slug = e.relSegments.length === 0 ? "" : e.relSegments.join("/");
      const id = e.relSegments[e.relSegments.length - 1] ?? "cron";
      const urlPath = `/api/cron${slug ? `/${slug}` : ""}`;
      return {
        id,
        path: urlPath,
        filePath: path.join(e.absDir, "route.ts"),
      } as DiscoveredRoute;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Recursive dir walk that returns every dir which contains a route file. */
async function walkDirsContainingRoute(
  absDir: string,
  relSegments: string[]
): Promise<{ absDir: string; relSegments: string[] }[]> {
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: { absDir: string; relSegments: string[] }[] = [];
  const hasRouteFile = dirents.some(
    (d) => d.isFile() && ROUTE_FILE_NAMES.has(d.name)
  );
  if (hasRouteFile) out.push({ absDir, relSegments });

  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    // Next.js conventions: ignore (group), [param], _private folders for
    // simplicity here. They aren't used in cron routes today.
    if (
      d.name.startsWith("(") ||
      d.name.startsWith("_") ||
      d.name.startsWith(".") ||
      d.name.startsWith("[")
    ) {
      continue;
    }
    out.push(
      ...(await walkDirsContainingRoute(
        path.join(absDir, d.name),
        [...relSegments, d.name]
      ))
    );
  }
  return out;
}

export async function readVercelCrons(): Promise<
  Map<string, string /* schedule */>
> {
  const root = await projectRoot();
  const file = path.join(root, "vercel.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    const out = new Map<string, string>();
    for (const c of parsed.crons ?? []) {
      if (c.path && c.schedule) out.set(c.path, c.schedule);
    }
    return out;
  } catch {
    return new Map();
  }
}
