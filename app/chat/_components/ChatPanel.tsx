"use client";

/* app/chat/_components/ChatPanel.tsx — per-record chat surface with
 * inline image attachments.
 *
 * Why this file owns the input box (rather than delegating to the
 * shared <AIStreamView />): the generic component sends a fixed
 * `extraBody` blob with every turn. Image attachments are turn-scoped
 * — they apply to ONE message and must be cleared after submit. That
 * shape is awkward to express through `extraBody`, so we drive the
 * `useAIStream` hook directly here and own the rendering of the
 * conversation, the textarea, the drop zone, and the file picker.
 *
 * Image pipeline (browser → server):
 *   1. User drops a file onto the panel or picks one via the paperclip
 *      button. The handler validates mime + size client-side.
 *   2. FileReader produces a base64 data URL we keep in component
 *      state. A thumbnail strip renders above the textarea.
 *   3. On submit we POST { message, images: [{mime, data}] } to
 *      /api/chat/stream — the server validates everything again and
 *      forwards as Anthropic `image` content blocks.
 *
 * No upload to storage today. Inline base64 keeps the round trip
 * simple and matches Anthropic's recommended path for one-shot
 * attachments under 5 MB. If we ever need persistence, swap the
 * in-memory data URL for a signed Supabase upload here; the wire
 * shape doesn't have to change.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import StopGenerationButton from "@/components/StopGenerationButton";
import { useAIStream } from "@/lib/ai-stream/client";

/** Mirrors the server-side allowlist + cap. Kept in sync manually
 *  because the server-side route is in a different runtime; if we
 *  add a new mime we update both call-sites. */
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_TURN = 4;

export interface ChatPanelProps {
  contextRef: string | null;
  workspaceId: string | null;
  placeholder: string;
  initialMessage: string | null;
}

interface AttachedImage {
  id: string;
  name: string;
  mime: string;
  /** Full data-URL, used both for the thumbnail and the POST body. The
   *  server accepts data URLs and strips the prefix. */
  dataUrl: string;
  bytes: number;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Set on user turns when they were sent with image attachments —
   *  we keep a thumbnail strip in the bubble. */
  images?: { mime: string; dataUrl: string }[];
  streaming?: boolean;
  aborted?: boolean;
  error?: string;
}

/** Read a `File` as a base64 data URL. Rejects when FileReader errors
 *  (e.g. permission denied or the file vanished mid-pick). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/** Generate a short, opaque client-only id for attached-image rows. */
function nextId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function ChatPanel({
  contextRef,
  workspaceId,
  placeholder,
  initialMessage,
}: ChatPanelProps) {
  const { state, start, stop, isStreaming } = useAIStream();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<AttachedImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Track the id of the assistant turn currently being filled so we
  // can mirror `state.text` into it without losing prior turns.
  const activeAssistantIdRef = useRef<string | null>(null);
  // Guard re-submitting `initialMessage` if the parent re-renders.
  const didAutoSubmitRef = useRef(false);

  /** Validate a single File before staging. Returns null on success. */
  const rejectionReasonFor = useCallback((file: File): string | null => {
    if (!ALLOWED_MIMES.has(file.type.toLowerCase())) {
      return `Skipped ${file.name}: only PNG, JPEG, WebP, and GIF are supported.`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `Skipped ${file.name}: max image size is 5 MB.`;
    }
    return null;
  }, []);

  /** Stage one or more files for the next message. We respect the
   *  per-turn cap; extras beyond it are dropped with an error toast. */
  const stageFiles = useCallback(
    async (files: FileList | File[]) => {
      setAttachError(null);
      const list = Array.from(files);
      if (list.length === 0) return;
      const room = MAX_IMAGES_PER_TURN - pendingImages.length;
      if (room <= 0) {
        setAttachError(
          `You can attach at most ${MAX_IMAGES_PER_TURN} images per message.`
        );
        return;
      }
      const next: AttachedImage[] = [];
      let firstError: string | null = null;
      for (const file of list.slice(0, room)) {
        const why = rejectionReasonFor(file);
        if (why) {
          firstError ??= why;
          continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          next.push({
            id: nextId(),
            name: file.name,
            mime: file.type.toLowerCase(),
            dataUrl,
            bytes: file.size,
          });
        } catch (e) {
          firstError ??= `Couldn't read ${file.name}: ${
            e instanceof Error ? e.message : String(e)
          }`;
        }
      }
      if (list.length > room) {
        firstError ??= `Only the first ${room} image${
          room === 1 ? "" : "s"
        } were attached (limit ${MAX_IMAGES_PER_TURN} per message).`;
      }
      if (firstError) setAttachError(firstError);
      if (next.length > 0) {
        setPendingImages((prev) => [...prev, ...next]);
      }
    },
    [pendingImages.length, rejectionReasonFor]
  );

  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Append the user message + a placeholder assistant turn, then kick
   *  off the stream. Images are dropped from state on submit so the
   *  user can't accidentally double-send them. */
  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      // Allow image-only submissions when there's at least one image —
      // useful for "what does this show?" flows. The server still
      // enforces a non-empty message though, so we always send at
      // least a single character when images are present.
      const effective =
        trimmed || (pendingImages.length > 0 ? "Describe this image." : "");
      if (!effective || isStreaming) return;

      const userId = `u_${nextId()}`;
      const asstId = `a_${nextId()}`;
      activeAssistantIdRef.current = asstId;

      const turnImages = pendingImages.map((p) => ({
        mime: p.mime,
        dataUrl: p.dataUrl,
      }));

      setTurns((prev) => [
        ...prev,
        {
          id: userId,
          role: "user",
          text: effective,
          images: turnImages.length > 0 ? turnImages : undefined,
        },
        { id: asstId, role: "assistant", text: "", streaming: true },
      ]);
      setInput("");

      const imagesPayload = pendingImages.map((p) => ({
        mime: p.mime,
        // Send the raw data URL; the server strips the prefix.
        data: p.dataUrl,
      }));
      setPendingImages([]);
      setAttachError(null);

      void start("/api/chat/stream", {
        message: effective,
        context_ref: contextRef,
        workspace_id: workspaceId,
        images: imagesPayload.length > 0 ? imagesPayload : undefined,
      });
    },
    [contextRef, isStreaming, pendingImages, start, workspaceId]
  );

  // Mirror `state.text` into the current assistant turn while
  // streaming. Mirrors AIStreamView's effect — same shape, different
  // home so we own all the UI here.
  useEffect(() => {
    const id = activeAssistantIdRef.current;
    if (!id) return;
    setTurns((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              text: state.text,
              streaming: state.status === "streaming",
              aborted: state.status === "aborted" ? true : t.aborted,
              error:
                state.status === "error"
                  ? state.error ?? "stream_error"
                  : t.error,
            }
          : t
      )
    );
    if (state.status !== "streaming") {
      activeAssistantIdRef.current = null;
    }
  }, [state.text, state.status, state.error]);

  // Auto-scroll to the bottom whenever a stream is producing output.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, state.status]);

  // Auto-submit `initialMessage` exactly once.
  useEffect(() => {
    if (didAutoSubmitRef.current) return;
    if (!initialMessage || !initialMessage.trim()) return;
    didAutoSubmitRef.current = true;
    submit(initialMessage);
    // We intentionally exclude `submit` from the dep array — its
    // identity changes whenever pendingImages does, and we don't want
    // a re-submit when the user attaches a file after the initial
    // message landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      void stageFiles(files);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    // Only react when the drag carries files — text drags shouldn't
    // open the drop overlay.
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Edge of the panel — relatedTarget is null when leaving the
    // window entirely.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void stageFiles(files);
    // Reset so the same file can be re-picked back-to-back.
    e.target.value = "";
  };

  const isEmpty = turns.length === 0;

  return (
    <div
      className="relative flex h-full flex-col bg-app text-app"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-tool-accent bg-app/70 backdrop-blur-sm">
          <div className="rounded-xl border border-app bg-app-elevated px-4 py-2 text-sm font-medium text-app">
            Drop images to attach
          </div>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-6"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        {isEmpty && (
          <div className="mx-auto mt-12 max-w-md text-center">
            <p className="text-sm text-secondary">{placeholder}</p>
            <p className="mt-2 text-[11px] text-faint">
              Attach images by dragging them in or using the paperclip below.
            </p>
          </div>
        )}
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} />
        ))}
        {state.status === "streaming" && (
          <div className="pt-1">
            <StopGenerationButton onStop={stop} visible={isStreaming} />
          </div>
        )}
      </div>

      <form
        className="sticky bottom-0 border-t border-app bg-app px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img) => (
              <div
                key={img.id}
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-app bg-app-elevated"
                title={`${img.name} (${(img.bytes / 1024).toFixed(0)} KB)`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-app/80 px-1.5 py-0.5 text-[10px] font-medium text-app opacity-0 transition-opacity group-hover:opacity-100"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        {attachError && (
          <p className="mb-2 text-[11px] text-red-500">{attachError}</p>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || pendingImages.length >= MAX_IMAGES_PER_TURN}
            aria-label="Attach image"
            title="Attach image (PNG, JPEG, WebP, GIF — max 5 MB)"
            className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm font-medium text-app transition-colors hover:border-tool-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PaperclipIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPickFiles}
            className="hidden"
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app placeholder:text-secondary focus:border-tool-accent focus:outline-none"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={
              isStreaming || (!input.trim() && pendingImages.length === 0)
            }
            className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm font-medium text-app transition-colors hover:border-tool-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] space-y-1">
          {turn.images && turn.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {turn.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={img.dataUrl}
                  alt="attachment"
                  className="h-24 w-24 rounded-lg border border-app object-cover"
                />
              ))}
            </div>
          )}
          {turn.text && (
            <div className="rounded-2xl rounded-br-md bg-tool-accent/10 px-3 py-2 text-sm text-app">
              {turn.text}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-app-elevated px-3 py-2 text-sm text-app">
          {turn.text || (turn.streaming ? "..." : "")}
        </div>
        {turn.aborted && (
          <p className="px-1 text-[11px] text-secondary">Stopped.</p>
        )}
        {turn.error && (
          <p className="px-1 text-[11px] text-red-500">{turn.error}</p>
        )}
      </div>
    </div>
  );
}

/** Small inline SVG so we don't pull a full icon library into this leaf
 *  component. Sized to match the button's text height. */
function PaperclipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
