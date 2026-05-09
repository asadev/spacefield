import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchAuthUsersByIds, formatDateTime } from "../../../../_lib";
import type { SurveyResponseRow, SurveyRow } from "../../../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string; response_id: string }>;
};

export default async function AdminSurveyResponsePage({ params }: PageProps) {
  const { id: rawId, response_id: rawRespId } = await params;
  const surveyId = decodeURIComponent(rawId);
  const responseId = decodeURIComponent(rawRespId);

  const admin = createAdminClient();

  const [{ data: respData }, { data: surveyData }] = await Promise.all([
    admin
      .from("survey_responses")
      .select("*")
      .eq("id", responseId)
      .eq("survey_id", surveyId)
      .maybeSingle(),
    admin
      .from("surveys")
      .select("*")
      .eq("id", surveyId)
      .maybeSingle(),
  ]);

  const response = (respData as SurveyResponseRow | null) ?? null;
  const survey = (surveyData as SurveyRow | null) ?? null;
  if (!response || !survey) notFound();

  const userMap = response.user_id
    ? await fetchAuthUsersByIds([response.user_id])
    : new Map();
  const userEmail = response.user_id
    ? (userMap.get(response.user_id)?.email ?? null)
    : null;

  const answersJson = jsonStringifySafe(response.answers);
  const metadataJson = jsonStringifySafe(response.metadata);
  const surveyQuestions = Array.isArray(survey.questions)
    ? (survey.questions as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/surveys/${encodeURIComponent(surveyId)}`}
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← {survey.display_name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Response detail
        </h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
          {response.id}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Submitted {formatDateTime(response.created_at)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="User" value={userEmail ?? response.user_id ?? "anon"} />
        <Field
          label="Workspace"
          value={response.workspace_id ?? "—"}
          mono
        />
        <Field
          label="NPS"
          value={response.nps_score == null ? "—" : String(response.nps_score)}
        />
        <Field
          label="Rating"
          value={response.rating == null ? "—" : `${response.rating}/5`}
        />
      </div>

      {response.comments && (
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Comments
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-app">
            {response.comments}
          </p>
        </div>
      )}

      {surveyQuestions.length > 0 && (
        <div className="rounded-xl border border-app bg-app-elevated">
          <div className="border-b border-app px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">
            Per-question answers
          </div>
          <ul className="divide-y divide-[color:var(--border-app,_theme(colors.gray.200))]">
            {surveyQuestions.map((q, i) => {
              const qid = String(q.id ?? `q${i}`);
              const label = String(q.label ?? qid);
              const type = String(q.type ?? "text");
              const ans = (response.answers as Record<string, unknown>)?.[qid];
              return (
                <li key={qid} className="px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                    {type}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-app">
                    {label}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs text-secondary">
                    {ans == null ? <em className="text-faint">no answer</em> : renderAnswer(ans)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-app bg-app-elevated">
        <div className="border-b border-app px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          Answers (raw JSON)
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-secondary">
          {answersJson}
        </pre>
      </div>

      {Object.keys(response.metadata ?? {}).length > 0 && (
        <div className="rounded-xl border border-app bg-app-elevated">
          <div className="border-b border-app px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted">
            Metadata
          </div>
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-secondary">
            {metadataJson}
          </pre>
        </div>
      )}
    </div>
  );
}

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderAnswer(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.55rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 break-all text-sm text-app ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
