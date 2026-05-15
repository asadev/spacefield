import Link from "next/link";

import {
  buildOrgTree,
  getActiveWorkspaceId,
  listEmployees,
} from "@/lib/people/server";
import type { OrgNode } from "@/lib/people/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Org chart · Space Field",
};

/**
 * SVG-based org chart. Pure server render — no graph library. Layout
 * uses a depth-first tidy approach where we measure each subtree's leaf
 * width and pack siblings side-by-side.
 */
export default async function OrgChartPage() {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-app">Org chart</h1>
        <p className="mt-3 text-sm text-secondary">
          You need a workspace first.
        </p>
      </main>
    );
  }
  const employees = await listEmployees({
    workspaceId,
    status: "active",
    limit: 500,
  });
  const trees = buildOrgTree(employees);

  // Layout constants.
  const NODE_W = 180;
  const NODE_H = 64;
  const HGAP = 24;
  const VGAP = 48;

  type Positioned = OrgNode & {
    x: number;
    y: number;
    width: number;
  };

  // Compute leaf width for each subtree.
  function measure(n: OrgNode): number {
    if (!n.children.length) return 1;
    return n.children.reduce((acc, c) => acc + measure(c), 0);
  }

  // Lay out nodes recursively, returning positioned nodes flat.
  function layout(
    n: OrgNode,
    depth: number,
    xOffset: number
  ): { nodes: Positioned[]; width: number } {
    const leafW = measure(n);
    const myWidth = leafW * (NODE_W + HGAP);
    const myX = xOffset + myWidth / 2 - NODE_W / 2;
    const out: Positioned[] = [
      {
        ...n,
        x: myX,
        y: depth * (NODE_H + VGAP),
        width: NODE_W,
      },
    ];
    let cursor = xOffset;
    for (const c of n.children) {
      const r = layout(c, depth + 1, cursor);
      out.push(...r.nodes);
      cursor += r.width;
    }
    return { nodes: out, width: myWidth };
  }

  // Lay out all roots horizontally side-by-side.
  let cursor = 0;
  const allNodes: Positioned[] = [];
  for (const root of trees) {
    const r = layout(root, 0, cursor);
    allNodes.push(...r.nodes);
    cursor += r.width;
  }

  const width = Math.max(NODE_W * 2, cursor);
  const height =
    (Math.max(...allNodes.map((n) => n.y), 0) + NODE_H + VGAP) || 200;

  // Edges: each node's children connect to it via right-angle lines.
  type Edge = { x1: number; y1: number; x2: number; y2: number };
  const edges: Edge[] = [];
  const positionById = new Map(allNodes.map((n) => [n.employee.id, n]));
  for (const n of allNodes) {
    for (const child of n.children) {
      const p = positionById.get(child.employee.id);
      if (!p) continue;
      const parentBottomX = n.x + NODE_W / 2;
      const parentBottomY = n.y + NODE_H;
      const childTopX = p.x + NODE_W / 2;
      const childTopY = p.y;
      edges.push({ x1: parentBottomX, y1: parentBottomY, x2: childTopX, y2: childTopY });
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/people" className="text-xs text-muted hover:text-tool-accent">
        ← Directory
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-app">Org chart</h1>
      <p className="mt-1 text-xs text-muted">
        {employees.length.toLocaleString()} active employees · {trees.length} root
        {trees.length === 1 ? "" : "s"}
      </p>

      {employees.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No employees to show.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-app bg-app-elevated p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            role="img"
            aria-label="Workspace org chart"
          >
            {edges.map((e, i) => {
              const midY = (e.y1 + e.y2) / 2;
              const d = `M ${e.x1} ${e.y1} L ${e.x1} ${midY} L ${e.x2} ${midY} L ${e.x2} ${e.y2}`;
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.3"
                  strokeWidth={1.5}
                />
              );
            })}
            {allNodes.map((n) => (
              <a
                key={n.employee.id}
                href={`/people/${n.employee.id}`}
                aria-label={`Open ${n.employee.full_name}'s profile`}
              >
                <g transform={`translate(${n.x},${n.y})`}>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    ry={10}
                    fill="var(--app-elevated, #fff)"
                    stroke="currentColor"
                    strokeOpacity={0.2}
                  />
                  <text
                    x={12}
                    y={24}
                    fontSize={13}
                    fontWeight={600}
                    fill="currentColor"
                  >
                    {n.employee.full_name.length > 22
                      ? n.employee.full_name.slice(0, 21) + "…"
                      : n.employee.full_name}
                  </text>
                  <text
                    x={12}
                    y={44}
                    fontSize={11}
                    fillOpacity={0.7}
                    fill="currentColor"
                  >
                    {(n.employee.job_title ?? "—").length > 26
                      ? (n.employee.job_title ?? "—").slice(0, 25) + "…"
                      : n.employee.job_title ?? "—"}
                  </text>
                  <text
                    x={NODE_W - 12}
                    y={NODE_H - 8}
                    fontSize={10}
                    textAnchor="end"
                    fillOpacity={0.5}
                    fill="currentColor"
                  >
                    {n.employee.department ?? ""}
                  </text>
                </g>
              </a>
            ))}
          </svg>
        </div>
      )}
    </main>
  );
}
