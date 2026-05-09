import { firstLetterAvatar } from "./_helpers";

/**
 * Integration logo / fallback avatar. Lifted out of `page.tsx` because
 * Next 16 page files can only declare approved page exports.
 */
export default function Logo({
  url,
  name,
  size = 32,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-md border border-app bg-app object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex items-center justify-center rounded-md border border-app bg-app-elevated text-sm font-semibold text-secondary"
      style={{ width: size, height: size }}
    >
      {firstLetterAvatar(name)}
    </div>
  );
}
