"use client";

/* TagChip — small inline pill rendered next to entity titles. Receives
 * the bare tag shape so it can live next to any entity (CRM contact,
 * file, deal, comment, etc.) without coupling to a specific entity
 * type. `onRemove` is optional — supply it where the chip lives in an
 * editable context (TagPicker, entity-detail panes); omit it on read-
 * only views like list rows and analytics. */

interface TagShape {
  name: string;
  color?: string | null;
}

export default function TagChip({
  tag,
  onRemove,
  size = "sm",
}: {
  tag: TagShape;
  onRemove?: () => void;
  size?: "xs" | "sm";
}) {
  const color = tag.color || "#64748b";
  const padding = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${padding} font-medium`}
      style={{
        backgroundColor: `${color}1a`,
        color,
        borderColor: `${color}33`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="truncate max-w-[140px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${tag.name}`}
          onClick={onRemove}
          className="ms-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
