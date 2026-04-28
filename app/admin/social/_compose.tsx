"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Inlined classes — ../_lib is server-only. Keep these in sync with
// app/admin/_lib.ts when global styling changes.
const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";
const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const buttonGhostClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50";

/* Composer for /admin/social. Client component so the upload dance,
 * char counter, and "schedule for…" toggle can all be local state.
 *
 * Image upload reuses the existing /api/files/save-content flow:
 * read each File as base64, POST it under the admin's primary
 * workspace, get back a workspace_files row, store its id. The file
 * is tagged "social" so the user's regular file list isn't polluted
 * (the tagging step is best-effort — failure doesn't block save).
 */

type Channel = "facebook" | "instagram";
type Mode = "single" | "both";

type AttachedFile = {
  id: string;
  name: string;
  size_bytes: number;
  preview_url: string;
};

const FB_LIMIT = 5000;
const IG_LIMIT = 2200;
const MAX_ATTACHMENTS = 10;

export default function Compose({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("single");
  const [channel, setChannel] = useState<Channel>("facebook");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [busy, setBusy] = useState<"idle" | "uploading" | "saving" | "publishing">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The character cap depends on which channel is selected. When
  // "both" is active we use the stricter (IG) limit so the same body
  // flies through both publish calls cleanly.
  const charLimit = useMemo(() => {
    if (mode === "both") return IG_LIMIT;
    return channel === "facebook" ? FB_LIMIT : IG_LIMIT;
  }, [mode, channel]);

  const allowsLink = mode !== "both" && channel === "facebook";

  const requiresImage = mode === "both" || channel === "instagram";

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const remaining = MAX_ATTACHMENTS - attachments.length;
      const picked = Array.from(files).slice(0, remaining);
      if (picked.length === 0) return;
      setBusy("uploading");
      setError(null);
      try {
        const next: AttachedFile[] = [];
        for (const f of picked) {
          const saved = await uploadOne(f, workspaceId);
          next.push(saved);
        }
        setAttachments((prev) => [...prev, ...next]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "upload failed");
      } finally {
        setBusy("idle");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [attachments.length, workspaceId]
  );

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const collectScheduledAt = (): string | null => {
    if (!scheduleEnabled) return null;
    if (!scheduledAt) return null;
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const persistOne = async (
    targetChannel: Channel,
    publishNow: boolean
  ): Promise<string> => {
    const upsertRes = await fetch("/api/admin/social/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: targetChannel,
        body,
        attachment_ids: attachments.map((a) => a.id),
        link_url: targetChannel === "facebook" ? linkUrl || null : null,
        scheduled_at: publishNow ? null : collectScheduledAt(),
      }),
    });
    const upsertJson = (await upsertRes.json()) as
      | { post: { id: string } }
      | { error: string };
    if (!upsertRes.ok || !("post" in upsertJson)) {
      throw new Error(
        "error" in upsertJson ? upsertJson.error : "save failed"
      );
    }
    if (!publishNow) return upsertJson.post.id;

    const pubRes = await fetch("/api/admin/social/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: upsertJson.post.id }),
    });
    if (!pubRes.ok) {
      const j = (await pubRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `publish failed (${pubRes.status})`);
    }
    return upsertJson.post.id;
  };

  const onSubmit = async (action: "draft" | "publish") => {
    setError(null);

    if (body.length > charLimit) {
      setError(`body too long: ${body.length} / ${charLimit}`);
      return;
    }
    if (action === "publish" && requiresImage && attachments.length === 0) {
      setError("image attachment required for instagram posts");
      return;
    }
    if (action === "publish" && scheduleEnabled && !scheduledAt) {
      setError("schedule mode is on but no datetime set");
      return;
    }

    const channels: Channel[] =
      mode === "both" ? ["facebook", "instagram"] : [channel];

    setBusy(action === "publish" ? "publishing" : "saving");
    try {
      // Publishing immediately = no schedule. Saving a draft = schedule
      // is honored if the user set one (becomes status='scheduled').
      const publishNow = action === "publish" && !scheduleEnabled;
      for (const c of channels) {
        await persistOne(c, publishNow);
      }
      // Reset composer on success.
      setBody("");
      setLinkUrl("");
      setAttachments([]);
      setScheduleEnabled(false);
      setScheduledAt("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  };

  const overLimit = body.length > charLimit;
  const isWorking = busy !== "idle";

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Channels
        </span>
        <ChannelToggle
          value={mode === "both" ? "both" : channel}
          onChange={(v) => {
            if (v === "both") {
              setMode("both");
            } else {
              setMode("single");
              setChannel(v);
            }
          }}
        />
      </div>

      <textarea
        className={`${inputClass} min-h-[140px] resize-y`}
        placeholder={
          mode === "both"
            ? "Write once — posted to both Facebook and Instagram"
            : channel === "facebook"
            ? "Write your Facebook post"
            : "Write your Instagram caption"
        }
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-1 flex justify-end text-[11px] tabular-nums">
        <span className={overLimit ? "text-red-500" : "text-faint"}>
          {body.length} / {charLimit}
        </span>
      </div>

      {allowsLink && (
        <div className="mt-3">
          <label className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Link (Facebook only)
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://spacefield.co/…"
            className={`${inputClass} mt-1`}
          />
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Images ({attachments.length} / {MAX_ATTACHMENTS})
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS || isWorking}
            className={buttonGhostClass}
          >
            Add image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
        {attachments.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative aspect-square overflow-hidden rounded-md border border-app bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.preview_url}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 top-1 rounded-md bg-app/80 px-1.5 py-0.5 text-[10px] text-app opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={isWorking}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-secondary">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
          />
          Schedule for later
        </label>
        {scheduleEnabled && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={`${inputClass} w-auto`}
          />
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-app bg-app-elevated p-2 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onSubmit("draft")}
          disabled={isWorking || overLimit}
          className={buttonGhostClass}
        >
          {busy === "saving" ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={() => onSubmit("publish")}
          disabled={isWorking || overLimit}
          className={buttonClass}
        >
          {busy === "publishing"
            ? "Publishing…"
            : scheduleEnabled
            ? "Schedule"
            : "Publish now"}
        </button>
      </div>
    </div>
  );
}

function ChannelToggle({
  value,
  onChange,
}: {
  value: Channel | "both";
  onChange: (v: Channel | "both") => void;
}) {
  const opts: { v: Channel | "both"; label: string }[] = [
    { v: "facebook", label: "Facebook" },
    { v: "instagram", label: "Instagram" },
    { v: "both", label: "Both" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-app bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={[
            "rounded-md px-3 py-1 text-xs transition-colors",
            value === o.v
              ? "bg-tool-accent text-white"
              : "text-secondary hover:text-app",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

async function uploadOne(file: File, workspaceId: string): Promise<AttachedFile> {
  const buffer = await file.arrayBuffer();
  const contentBase64 = bufferToBase64(buffer);
  const res = await fetch("/api/files/save-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      name: file.name || "image",
      contentType: file.type || "image/jpeg",
      contentBase64,
    }),
  });
  const json = (await res.json()) as
    | { file: { id: string; name: string; size_bytes: number } }
    | { error: string };
  if (!res.ok || !("file" in json)) {
    throw new Error("error" in json ? json.error : "upload failed");
  }
  // Best-effort: tag the file as "social" so it's filterable later
  // and doesn't pollute the regular files list. Not fatal on error.
  fetch("/api/files/tag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId: json.file.id,
      tags: [{ name: "social", color: "sky" }],
    }),
  }).catch(() => undefined);

  return {
    id: json.file.id,
    name: json.file.name,
    size_bytes: json.file.size_bytes,
    // Local preview from the picked File while the page hasn't
    // refreshed; cheaper than another round-trip for a presigned URL.
    preview_url: URL.createObjectURL(file),
  };
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Chunked to avoid call-stack limits on huge images.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]
    );
  }
  return btoa(binary);
}
