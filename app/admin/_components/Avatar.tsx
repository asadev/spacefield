export default function Avatar({
  url,
  fallback,
  size = 32,
}: {
  url: string | null | undefined;
  fallback: string;
  size?: number;
}) {
  const initials = (fallback || "?").trim().slice(0, 1).toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-app object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="shrink-0 rounded-full border border-app bg-app text-center font-medium text-secondary"
      style={{
        width: size,
        height: size,
        lineHeight: `${size}px`,
        fontSize: Math.max(10, Math.floor(size * 0.4)),
      }}
    >
      {initials}
    </div>
  );
}
