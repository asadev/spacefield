/* share.example.com landing — clean, professional, no marketing copy.
 *
 * Visitors hit this when they mistype or visit the apex. Just brand mark,
 * no preachy explanation. Real links bypass this via the /p/ /f/ /q/ etc
 * route handlers.
 */

export const dynamic = "force-static";

export const metadata = {
  title: { absolute: "Share" },
  description: "",
  robots: { index: true, follow: true },
  openGraph: { title: "Share", description: "", siteName: "Share" },
};

export default function ShareLanding() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold text-white">
          ts
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Share</h1>
      </div>
    </div>
  );
}
