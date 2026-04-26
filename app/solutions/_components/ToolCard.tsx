import { ReactNode } from "react";

interface ToolCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

// Standard card with L-shaped corner accents + violet top line.
export default function ToolCard({
  title,
  subtitle,
  children,
  className = "",
}: ToolCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-app bg-surface p-6 ${className}`}
    >
      <span className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l border-t border-violet-400/25" />
      <span className="pointer-events-none absolute right-0 bottom-0 h-5 w-5 border-r border-b border-violet-400/15" />
      <span className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/35 to-transparent" />

      {(title || subtitle) && (
        <header className="mb-5">
          {subtitle && (
            <div className="text-[0.55rem] uppercase tracking-[0.22em] text-violet-300/70">
              {subtitle}
            </div>
          )}
          {title && (
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-app">
              {title}
            </h2>
          )}
        </header>
      )}

      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-secondary">
          {label}
        </span>
        {hint && <span className="text-[0.6rem] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-surface px-3 py-2 text-sm text-app placeholder:text-faint transition-colors focus:border-app-focus focus:outline-none ${extra}`;
}

export function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-4 ${
        accent
          ? "border-violet-400/30 bg-violet-500/[0.08]"
          : "border-app bg-surface"
      }`}
    >
      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div
        className={`mt-1.5 text-xl font-semibold tracking-tight ${
          accent ? "text-violet-100" : "text-app"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
