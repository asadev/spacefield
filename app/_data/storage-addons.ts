/* Storage add-on options — single source of truth.
 *
 * Imported by:
 *   - /pricing page (tier card add-on dropdown)
 *   - Settings → Workspaces (per-workspace add-on selector)
 *   - /admin/tiers (admin reference; not edited from there)
 *
 * The DB check constraint on workspace_storage_addons.addon_gb only
 * accepts the GB values listed here (500, 2048, 10240). Adding a new
 * option means updating this file AND the SQL check constraint.
 *
 * Pricing is display-only for v1 — payment integration ships later.
 */

export interface StorageAddonOption {
  /** GB delta applied on top of the tier base. 0 means "no add-on". */
  gb: number;
  /** Short label for dropdowns ("None", "+500 GB", "+2 TB", "+10 TB"). */
  label: string;
  /** Human-readable price ("Free", "$5/mo", etc). */
  price: string;
  /** Cents per month, for downstream payment integration. 0 for "None". */
  priceCentsMonthly: number;
}

export const STORAGE_ADDON_OPTIONS: readonly StorageAddonOption[] = [
  { gb: 0, label: "None", price: "Included", priceCentsMonthly: 0 },
  { gb: 500, label: "+500 GB", price: "$5 / mo", priceCentsMonthly: 500 },
  { gb: 2048, label: "+2 TB", price: "$15 / mo", priceCentsMonthly: 1500 },
  { gb: 10240, label: "+10 TB", price: "$50 / mo", priceCentsMonthly: 5000 },
] as const;

/** Allowed non-zero values matching the SQL check constraint. */
export const STORAGE_ADDON_GB_VALUES = [500, 2048, 10240] as const;

export type StorageAddonGb = (typeof STORAGE_ADDON_GB_VALUES)[number];

export function isValidAddonGb(value: number): value is StorageAddonGb | 0 {
  return value === 0 || STORAGE_ADDON_GB_VALUES.includes(value as StorageAddonGb);
}

/** Format a byte count as a friendly storage string ("5 GB", "1 TB", "2.1 TB"). */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const TB = 1024 * 1024 * 1024 * 1024;
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= TB) {
    const tb = bytes / TB;
    return `${tb % 1 === 0 ? tb.toFixed(0) : tb.toFixed(1)} TB`;
  }
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
  }
  return `${bytes} B`;
}

/** Format a megabyte tier-base value as a friendly string. */
export function formatStorageMb(mb: number): string {
  return formatStorageBytes(mb * 1024 * 1024);
}

/** Format a gigabyte add-on value as a friendly string. */
export function formatStorageGb(gb: number): string {
  return formatStorageBytes(gb * 1024 * 1024 * 1024);
}

/** Compute the effective cap (in bytes) for a tier-base + add-on combo. */
export function effectiveCapBytes(tierBaseMb: number, addonGb: number): number {
  return tierBaseMb * 1024 * 1024 + addonGb * 1024 * 1024 * 1024;
}
