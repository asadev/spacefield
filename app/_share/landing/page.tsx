/* Bare landing for toshare.net root — most traffic here is mistyped. */

export const dynamic = "force-static";

export default function ToShareLanding() {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white text-2xl font-semibold dark:bg-white dark:text-slate-900">
        ts
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">toshare.net</h1>
        <p className="mt-2 text-sm text-slate-500">
          A simple way to share a form, page, or file with someone.
        </p>
      </div>
      <p className="mx-auto max-w-md text-sm text-slate-500">
        If someone gave you a toshare link, paste it in your browser to open it.
        Each link looks like <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">toshare.net/p/xxx</code>.
      </p>
    </div>
  );
}
