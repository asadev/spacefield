"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * CRM — native desktop app entry.
 * Phase 1 (this commit): wires the Shell. Each section renders an empty
 * placeholder. Phase 2 agents (Pipeline UI, Records UI, Activities + Custom
 * Fields + Permissions) replace the inner surfaces but keep Shell's
 * `section` state contract.
 * ───────────────────────────────────────────────────────────────────── */

import type { NativeAppProps } from "../_data/tools-list";
import Shell from "./_components/Shell";

export default function CrmApp(props: NativeAppProps) {
  return <Shell {...props} />;
}
