"use client";

import { useEffect, useState } from "react";
import {
  NamedScenario,
  addScenario,
  buildShareUrl,
  canAddScenario,
  copyText,
  download,
  loadScenarios,
  removeScenario,
  scenarioLimit,
} from "../_lib/scenarios";
import { createClient } from "@/lib/supabase/client";
import { isProClient } from "@/lib/pro/client";

interface Props<T> {
  slug: string;
  state: T;
  onLoad: (data: T) => void;
  // Export payloads — caller decides what to dump.
  exports?: {
    csv?: () => string;
    json?: () => unknown;
    markdown?: () => string;
  };
  label?: string;
}

// Tucked below the primary tool output. Handles scenario save/load,
// shareable URL, and CSV/JSON/Markdown export. Kept intentionally small.
export default function ScenarioBar<T>({
  slug,
  state,
  onLoad,
  exports,
  label = "Scenarios",
}: Props<T>) {
  const [list, setList] = useState<NamedScenario<T>[]>([]);
  const [name, setName] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    setList(loadScenarios<T>(slug));
  }, [slug]);

  // Pull Pro status once — used for the scenario cap. Defaults to false
  // (free tier) so anonymous users still hit the 5-scenario cap.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) isProClient(data.user.id).then(setIsPro);
    });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  const save = () => {
    if (!canAddScenario(slug, isPro)) {
      setFlash(
        isPro
          ? `Limit ${scenarioLimit(true)} reached — delete one first`
          : `Free tier caps at ${scenarioLimit(false)} — invite 3 friends to unlock Pro (50)`
      );
      return;
    }
    const next = addScenario(slug, name.trim() || `Scenario ${list.length + 1}`, state);
    setList(next);
    setName("");
    setFlash("Saved");
  };

  const remove = (id: string) => setList(removeScenario<T>(slug, id));

  const share = async () => {
    const url = buildShareUrl(state);
    if (!url) return;
    const ok = await copyText(url);
    setFlash(ok ? "URL copied" : "Copy failed");
  };

  const exportCsv = () => {
    if (!exports?.csv) return;
    download(`${slug}.csv`, exports.csv(), "text/csv");
  };
  const exportJson = () => {
    if (!exports?.json) return;
    download(
      `${slug}.json`,
      JSON.stringify(exports.json(), null, 2),
      "application/json"
    );
  };
  const exportMd = () => {
    if (!exports?.markdown) return;
    download(`${slug}.md`, exports.markdown(), "text/markdown");
  };

  return (
    <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[0.65rem] uppercase tracking-[0.22em] text-violet-300/80 hover:text-violet-200"
      >
        <span>{label}</span>
        <span className="flex items-center gap-3">
          {flash && (
            <span className="text-[0.6rem] text-violet-200/80 normal-case tracking-normal">
              {flash}
            </span>
          )}
          <span>{open ? "−" : "+"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scenario name"
              className="flex-1 min-w-[140px] rounded-md border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={save}
              className="rounded-md border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-500/25"
            >
              Save
            </button>
            <button
              type="button"
              onClick={share}
              className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.05]"
            >
              Share URL
            </button>
            {exports?.csv && (
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.05]"
              >
                CSV
              </button>
            )}
            {exports?.json && (
              <button
                type="button"
                onClick={exportJson}
                className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.05]"
              >
                JSON
              </button>
            )}
            {exports?.markdown && (
              <button
                type="button"
                onClick={exportMd}
                className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.05]"
              >
                Markdown
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.05]"
            >
              Print / PDF
            </button>
          </div>

          {list.length > 0 ? (
            <ul className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08]">
              {list.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate text-white/90">{s.name}</div>
                    <div className="text-[0.6rem] text-white/40">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLoad(s.data)}
                      className="rounded border border-white/[0.1] bg-white/[0.02] px-2 py-1 text-[0.65rem] text-white/80 hover:bg-white/[0.05]"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="rounded border border-white/[0.1] bg-white/[0.02] px-2 py-1 text-[0.65rem] text-white/60 hover:bg-red-500/10 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[0.7rem] text-white/40">
              No saved scenarios yet. Save the current inputs with a name to
              revisit later.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
