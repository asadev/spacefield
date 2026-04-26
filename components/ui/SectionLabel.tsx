interface SectionLabelProps {
  children: string;
  color?: "default" | "purple" | "blue" | "emerald" | "amber" | "rose";
}

const dotColors = {
  default: "bg-white/40",
  purple: "bg-purple-400/70",
  blue: "bg-blue-400/70",
  emerald: "bg-emerald-400/70",
  amber: "bg-amber-400/70",
  rose: "bg-rose-400/70",
};

const lineColors = {
  default: "bg-white/30",
  purple: "bg-purple-400/30",
  blue: "bg-blue-400/30",
  emerald: "bg-emerald-400/30",
  amber: "bg-amber-400/30",
  rose: "bg-rose-400/30",
};

const textColors = {
  default: "text-white/50",
  purple: "text-purple-300/70",
  blue: "text-blue-300/70",
  emerald: "text-emerald-300/70",
  amber: "text-amber-300/70",
  rose: "text-rose-300/70",
};

export default function SectionLabel({ children, color = "default" }: SectionLabelProps) {
  return (
    <span className={`inline-flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.2em] ${textColors[color]}`}>
      <span className="flex items-center gap-1.5">
        <span className={`block h-1.5 w-1.5 rounded-full ${dotColors[color]}`} />
        <span className={`block h-px w-5 ${lineColors[color]}`} />
      </span>
      {children}
    </span>
  );
}
