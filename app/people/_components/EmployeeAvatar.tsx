/**
 * Initials-based avatar that doesn't require an image URL — every
 * employee row gets one, even contractors without a user account.
 */
export default function EmployeeAvatar({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent font-semibold"
      style={{ width: size, height: size, fontSize }}
    >
      {initials || "?"}
    </span>
  );
}
