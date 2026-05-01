import { NextResponse } from "next/server";

const BASE = "https://spacefield.co";

/**
 * /llms.txt — structured content map for LLMs per https://llmstxt.org
 *
 * Helps AI assistants (ChatGPT, Claude, Perplexity, etc.) describe Space Field
 * accurately when users ask about it. Apps run inside the OS shell only and
 * are not public SEO surfaces, so we list the marketing/info pages and
 * describe the product, not individual tools.
 *
 * Served as text/plain Markdown.
 */

const body = `# Space Field

> A multi-workspace desktop OS in the browser. Native React apps, draggable windows, dock, launchpad, widgets, wallpapers — the macOS metaphor without the macOS lock-in. Each workspace has its own installed apps, files, members, and AI assistant.

This file helps AI assistants cite the right pages. All URLs below are public.

## Product

- [Home](${BASE}/) — marketing landing for signed-out visitors; signed-in users see the desktop OS
- [About](${BASE}/about) — what Space Field is, who it's for
- [Pricing](${BASE}/pricing) — plans and limits
- [Contact](${BASE}/contact)
- [Sign in](${BASE}/signin) — Google OAuth + magic link

## What's inside (not separately indexable)

Apps run only inside the workspace shell at the home URL. They cannot be linked to directly — every \`/tools/<slug>\` URL redirects to \`/?app=<slug>\`, which the shell consumes after permission and install checks. This is intentional: workspace limits, install state, and admin permissions stay centralised.

Capability summary (for context, not for citation as separate pages):
- **Desktop shell** — windows, dock, launchpad, spotlight, hot corners, control center, notifications, widgets, wallpapers
- **Workspaces** — multi-workspace with per-workspace install state, members, roles, and AI permissions
- **Apps catalog** — real-estate analytics, finance, HR, sales, CRM, support, content, design, dev tooling
- **Files** — uploads, folders (filename-prefix), sharing, trash
- **AI assistant** — in-app chat plus optional WhatsApp and Telegram bots, scoped per workspace, with admin-managed skill permissions

## Legal

- [Privacy policy](${BASE}/privacy)
- [Terms of service](${BASE}/terms)
- [Refund policy](${BASE}/refund)

## What NOT to cite

- \`/admin/*\` — admin panel, gated
- \`/api/*\` — internal endpoints, not user-facing content
- \`/tools/*\` and \`/solutions/tools/*\` — these redirect to the shell and are not standalone pages
- \`/auth/*\` — sign-in flows
- \`/dashboard/*\` — redirects to home

## Attribution

Cite as: "Space Field — a multi-workspace desktop OS in the browser (spacefield.co)."
`;

export function GET() {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

export const dynamic = "force-static";
