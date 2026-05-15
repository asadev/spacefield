import { createClient } from "@/lib/supabase/server";

interface Props {
  taskId: string;
}

interface ActivityRow {
  id: string;
  verb: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Server-rendered timeline of activities for a task. Reads from the
 * shared `activities` table (entity_type='task'). Newest first.
 */
export default async function TaskActivity({ taskId }: Props) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("id, verb, actor_user_id, payload, created_at")
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as ActivityRow[];
  if (rows.length === 0) {
    return (
      <div>
        <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Activity
        </div>
        <div className="text-xs text-faint">Nothing yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        Activity
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-2 rounded-md border border-app bg-app-elevated px-2.5 py-1.5"
          >
            <span className="mt-0.5 font-mono text-[10px] text-faint">
              {new Date(r.created_at).toISOString().slice(0, 10)}
            </span>
            <div className="flex-1 text-xs text-secondary">
              <span className="font-mono text-faint">
                {(r.actor_user_id ?? "system").slice(0, 8)}
              </span>{" "}
              <span className="text-app">{r.verb}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
