import Link from "next/link";

import { buttonClass, buttonGhostClass, formatDateTime, inputClass } from "../_lib";
import type { HelpArticleRow, HelpCategoryRow } from "../_types";
import { ArticlePreview } from "./_ArticlePreview";
import {
  archiveArticle,
  createArticle,
  deleteArticle,
  publishArticle,
  updateArticle,
} from "./_actions";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "authenticated", label: "Authenticated only" },
  { value: "admin_only", label: "Admin only" },
] as const;

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createArticle(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateArticle(formData);
}

async function publishAction(formData: FormData): Promise<void> {
  "use server";
  await publishArticle(formData);
}

async function archiveAction(formData: FormData): Promise<void> {
  "use server";
  await archiveArticle(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteArticle(formData);
}

export function ArticleForm({
  mode,
  article,
  categories,
}: {
  mode: "create" | "edit";
  article: HelpArticleRow | null;
  categories: HelpCategoryRow[];
}) {
  const action = mode === "create" ? createAction : updateAction;
  const submitLabel = mode === "create" ? "Create article" : "Save changes";
  const initialBody = article?.body ?? "";

  return (
    <div className="space-y-4">
      {mode === "edit" && article && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ReadOnlyStat label="Views" value={article.view_count} />
          <ReadOnlyStat label="Helpful" value={article.helpful_count} tone="emerald" />
          <ReadOnlyStat
            label="Not helpful"
            value={article.not_helpful_count}
            tone="rose"
          />
          <ReadOnlyStat
            label="Helpful ratio"
            value={
              article.helpful_count + article.not_helpful_count === 0
                ? "—"
                : `${Math.round(
                    (article.helpful_count /
                      (article.helpful_count + article.not_helpful_count)) *
                      100
                  )}%`
            }
          />
        </div>
      )}

      <form
        action={action}
        className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
      >
        {mode === "edit" && article && (
          <input type="hidden" name="id" value={article.id} />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Title
            </span>
            <input
              type="text"
              name="title"
              defaultValue={article?.title ?? ""}
              required
              maxLength={200}
              placeholder="How to invite a teammate"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Slug (URL part)
            </span>
            <input
              type="text"
              name="slug"
              defaultValue={article?.slug ?? ""}
              maxLength={120}
              pattern="[a-z0-9-]*"
              placeholder="auto-generated from title if blank"
              className={`${inputClass} font-mono`}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Category
            </span>
            <select
              name="category_id"
              defaultValue={article?.category_id ?? ""}
              className={inputClass}
            >
              <option value="">— uncategorised —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Status
            </span>
            <select
              name="status"
              defaultValue={article?.status ?? "draft"}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Visibility
            </span>
            <select
              name="visibility"
              defaultValue={article?.visibility ?? "public"}
              className={inputClass}
            >
              {VISIBILITY_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Excerpt (1–2 sentence summary, used in lists)
            </span>
            <textarea
              name="excerpt"
              defaultValue={article?.excerpt ?? ""}
              rows={2}
              maxLength={400}
              placeholder="Short summary shown on the index page."
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="flex flex-col gap-1 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Body (markdown)
              </span>
              <span className="text-[10px] text-faint">
                # heading · **bold** · *italic* · `code` · - list · &gt; quote
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <textarea
                name="body"
                defaultValue={initialBody}
                rows={28}
                placeholder={"## Step 1\n\nDo the thing.\n\n- bullet\n- bullet"}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-faint">
                  Live preview
                </div>
                <ArticlePreview initial={initialBody} />
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Tags (comma-separated)
            </span>
            <input
              type="text"
              name="tags"
              defaultValue={article?.tags.join(", ") ?? ""}
              placeholder="onboarding, billing, troubleshooting"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Sort order
            </span>
            <input
              type="number"
              name="sort_order"
              defaultValue={article?.sort_order ?? 0}
              className={`${inputClass} font-mono tabular-nums`}
            />
          </label>

          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Metadata (JSON)
            </span>
            <textarea
              name="metadata"
              defaultValue={
                article && Object.keys(article.metadata).length > 0
                  ? JSON.stringify(article.metadata, null, 2)
                  : ""
              }
              rows={3}
              placeholder='{"reviewer": "alex"}'
              className={`${inputClass} resize-y font-mono text-xs`}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-muted">
            {mode === "edit" && article ? (
              <>
                Created {formatDateTime(article.created_at)} · last updated{" "}
                {formatDateTime(article.updated_at)}
                {article.published_at
                  ? ` · published ${formatDateTime(article.published_at)}`
                  : ""}
              </>
            ) : (
              "New article — slug is generated from the title if you leave it blank."
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/help" className={buttonGhostClass}>
              Cancel
            </Link>
            <button type="submit" className={buttonClass}>
              {submitLabel}
            </button>
          </div>
        </div>
      </form>

      {mode === "edit" && article && (
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Workflow
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {article.status !== "published" && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={article.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
                >
                  Publish
                </button>
              </form>
            )}
            {article.status !== "archived" && (
              <form action={archiveAction}>
                <input type="hidden" name="id" value={article.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
                >
                  Archive
                </button>
              </form>
            )}
            <Link
              href={`/help/${encodeURIComponent(article.slug)}`}
              target="_blank"
              rel="noreferrer"
              className={buttonGhostClass}
            >
              View public ↗
            </Link>
          </div>
          <details className="mt-4 rounded-lg border border-app bg-app p-3">
            <summary className="cursor-pointer text-xs text-muted">
              Danger zone
            </summary>
            <form
              action={deleteAction}
              className="mt-3 flex items-center gap-2"
            >
              <input type="hidden" name="id" value={article.id} />
              <button
                type="submit"
                className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
              >
                Delete article
              </button>
              <span className="text-[11px] text-muted">Permanent.</span>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}

function ReadOnlyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "rose";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500"
        : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
