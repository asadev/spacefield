/**
 * Tiny line-diff renderer. We don't pull in a diff library (per the
 * contract — keep the component simple), so this implementation uses the
 * classic O(n×m) longest-common-subsequence DP and walks the matrix to
 * emit a unified diff. Inputs in this admin context are short enough
 * (a few hundred lines max per version) that the cost is negligible.
 *
 * Each emitted segment is one of:
 *   - { type: 'eq', text } — unchanged line, present in both sides.
 *   - { type: 'del', text } — line present only in `before`.
 *   - { type: 'add', text } — line present only in `after`.
 */

export type DiffSegment =
  | { type: "eq"; text: string }
  | { type: "del"; text: string }
  | { type: "add"; text: string };

export function lineDiff(before: string, after: string): DiffSegment[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;

  // dp[i][j] = LCS length for a[0..i] / b[0..j].
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Walk back to produce the diff in forward order.
  const segments: DiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      segments.push({ type: "eq", text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      segments.push({ type: "del", text: a[i - 1] });
      i -= 1;
    } else {
      segments.push({ type: "add", text: b[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    segments.push({ type: "del", text: a[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    segments.push({ type: "add", text: b[j - 1] });
    j -= 1;
  }
  segments.reverse();
  return segments;
}

export type DiffViewProps = {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
};

export default function DiffView({
  before,
  after,
  beforeLabel,
  afterLabel,
}: DiffViewProps) {
  const segments = lineDiff(before, after);
  const stats = segments.reduce(
    (acc, s) => {
      if (s.type === "del") acc.removed += 1;
      else if (s.type === "add") acc.added += 1;
      else acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span>
          <span className="text-rose-500">−</span> {beforeLabel}
        </span>
        <span>
          <span className="text-emerald-500">+</span> {afterLabel}
        </span>
        <span className="text-faint">·</span>
        <span className="text-rose-500">−{stats.removed} lines</span>
        <span className="text-emerald-500">+{stats.added} lines</span>
        <span className="text-faint">{stats.unchanged} unchanged</span>
      </div>

      <pre className="overflow-x-auto rounded-md border border-app bg-app p-3 font-mono text-[11px] leading-5">
        {segments.length === 0 ? (
          <span className="text-faint">(empty)</span>
        ) : (
          segments.map((seg, idx) => {
            if (seg.type === "eq") {
              return (
                <div key={idx} className="text-secondary">
                  <span className="select-none text-faint">&nbsp;&nbsp;</span>
                  {seg.text || " "}
                </div>
              );
            }
            if (seg.type === "add") {
              return (
                <div key={idx} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <span className="select-none">+&nbsp;</span>
                  {seg.text || " "}
                </div>
              );
            }
            return (
              <div key={idx} className="bg-rose-500/10 text-rose-500">
                <span className="select-none">−&nbsp;</span>
                {seg.text || " "}
              </div>
            );
          })
        )}
      </pre>
    </div>
  );
}
