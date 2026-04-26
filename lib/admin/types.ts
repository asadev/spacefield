import type { Region } from "@/lib/region";

export type SourceCadence =
  | "live"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annually"
  | "adhoc";

export type SourceConfidence = "high" | "medium" | "low";

export type SourceMetadata = {
  label: string;
  source: string;
  sourceUrl?: string;
  lastUpdated: string; // YYYY-MM-DD
  cadence: SourceCadence;
  methodology: string;
  confidence: SourceConfidence;
  region?: Region;
  notes?: string;
};

export type DataSource = {
  id: string; // URL-encoded relPath for routing
  filePath: string; // absolute
  relPath: string; // relative to repo root, forward slashes
  region?: Region;
  metadata: SourceMetadata | null;
  gitLastModified: string | null; // ISO
  recordCount: number | null;
  sizeBytes: number;
};

export type FreshnessTier = "fresh" | "aging" | "stale" | "unknown";

export function tierForDate(iso: string | null | undefined, now: Date = new Date()): FreshnessTier {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const days = (now.getTime() - then) / (1000 * 60 * 60 * 24);
  if (days < 30) return "fresh";
  if (days < 90) return "aging";
  return "stale";
}

export function bestLastUpdated(src: DataSource): string | null {
  return src.metadata?.lastUpdated || src.gitLastModified || null;
}
