import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.cwd();

export type GitCommit = {
  hash: string;
  shortHash: string;
  isoDate: string;
  author: string;
  subject: string;
};

function run(args: string[], opts: { cwd?: string } = {}): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd: opts.cwd || REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 4 * 1024 * 1024,
    });
    return out.toString();
  } catch {
    return null;
  }
}

/** ISO date of the last commit that touched `file` (absolute or relative). */
export function lastModifiedISO(file: string): string | null {
  const rel = path.isAbsolute(file) ? path.relative(REPO_ROOT, file) : file;
  const out = run(["log", "-1", "--format=%cI", "--", rel]);
  if (!out) return null;
  const trimmed = out.trim();
  return trimmed || null;
}

/** Last N commits touching a single file. */
export function fileHistory(file: string, limit = 10): GitCommit[] {
  const rel = path.isAbsolute(file) ? path.relative(REPO_ROOT, file) : file;
  const out = run([
    "log",
    `-n`,
    String(limit),
    "--format=%H|%h|%cI|%an|%s",
    "--",
    rel,
  ]);
  if (!out) return [];
  return parseCommits(out);
}

/** Recent commits across the repo with changed files attached. */
export type GitCommitWithFiles = GitCommit & { files: string[] };

export function recentCommitsWithFiles(limit = 80): GitCommitWithFiles[] {
  const out = run([
    "log",
    `-n`,
    String(limit),
    "--name-only",
    "--format=---%n%H|%h|%cI|%an|%s",
  ]);
  if (!out) return [];
  const chunks = out.split(/^---\s*$/m).map((c) => c.trim()).filter(Boolean);
  const results: GitCommitWithFiles[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const head = lines[0];
    const rest = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    const parts = head.split("|");
    if (parts.length < 5) continue;
    const [hash, shortHash, isoDate, author, ...subj] = parts;
    results.push({
      hash,
      shortHash,
      isoDate,
      author,
      subject: subj.join("|"),
      files: rest,
    });
  }
  return results;
}

function parseCommits(text: string): GitCommit[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 5) return null;
      const [hash, shortHash, isoDate, author, ...subj] = parts;
      return {
        hash,
        shortHash,
        isoDate,
        author,
        subject: subj.join("|"),
      } satisfies GitCommit;
    })
    .filter((v): v is GitCommit => v !== null);
}
