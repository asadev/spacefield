export const dynamic = "force-static";

export default function ShareNotFound() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Link not found</h1>
      <p className="text-sm text-slate-500">
        This share link is invalid, expired, or has been removed by its owner.
      </p>
    </div>
  );
}
