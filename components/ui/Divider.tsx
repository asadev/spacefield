export default function Divider({ label }: { label?: string }) {
  if (label) {
    return (
      <div className="flex items-center gap-4 py-8">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-xs uppercase tracking-widest text-white/30">{label}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
    );
  }
  return <div className="section-divider my-16" />;
}
