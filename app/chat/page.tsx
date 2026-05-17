/* app/chat/page.tsx — per-record AI chat surface.
 *
 * Reachable from any entity-detail page via:
 *
 *     <Link href={`/chat?context=task:${id}`}>Ask AI about this task</Link>
 *
 * Supported ref shapes: `task:<uuid>`, `project:<uuid>`,
 * `contact:<uuid>`, `deal:<uuid>`, `employee:<uuid>`.
 *
 * Server-renders the loaded entity into a header + initial prompt
 * chunk, then hands off to the client-side `ChatPanel`, which owns
 * the textarea + drop zone + file picker and talks to
 * `/api/chat/stream` via the shared `useAIStream` hook.
 *
 * Vision input: users can drag-drop or paperclip-pick PNG/JPEG/WebP/
 * GIF images (≤ 5 MB each, max 4 per message). The route forwards
 * them to Anthropic as inline base64 `image` content blocks alongside
 * the text question.
 *
 * Anonymous users see a sign-in nudge — the route is meaningless
 * without an authenticated workspace context.
 */

import Link from "next/link";

import { loadContext } from "@/lib/ai-context/load";
import { createClient } from "@/lib/supabase/server";

import ChatPanel from "./_components/ChatPanel";
import ChatHeader from "./_components/ChatHeader";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    context?: string | string[];
  }>;
}

function firstParam(v: string | string[] | undefined): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

export default async function ChatPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ref = firstParam(params.context);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-base font-semibold">Sign in to chat</h1>
        <p className="mt-2 text-sm text-secondary">
          The assistant needs your workspace context. Sign in to continue.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(
            ref ? `/chat?context=${ref}` : "/chat"
          )}`}
          className="mt-4 rounded-lg border border-app bg-app-elevated px-4 py-2 text-sm font-medium text-app transition-colors hover:border-tool-accent"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const loaded = await loadContext(ref);

  return (
    <div className="flex h-[100svh] flex-col bg-app">
      <ChatHeader
        title={loaded.title}
        subtitle={loaded.subtitle}
        href={loaded.href}
        kind={loaded.kind}
      />
      <div className="min-h-0 flex-1">
        <ChatPanel
          contextRef={loaded.ref}
          workspaceId={loaded.workspace_id}
          placeholder={
            loaded.kind === "none"
              ? "Ask anything about your workspace..."
              : `Ask about this ${loaded.kind}...`
          }
          initialMessage={
            loaded.kind === "none"
              ? null
              : `Give me a quick summary of this ${loaded.kind} and any next steps.`
          }
        />
      </div>
    </div>
  );
}
