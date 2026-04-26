# Space Field

A multi-workspace desktop OS in the browser. Native React apps, draggable
windows, dock, launchpad, widgets, wallpapers — the macOS metaphor without
the macOS lock-in.

Built with Next.js 15 (App Router), Tailwind v4, and a per-workspace
namespaced localStorage state model.

## Develop

```bash
pnpm install
pnpm dev   # http://localhost:3000
```

## Architecture quick map

- `app/page.tsx` — root route, mounts the Desktop component
- `app/tools/_components/Desktop.tsx` — the workspace shell
  - `WorkspaceProvider` + `useWorkspaces` for multi-workspace support
  - All state namespaced as `ws:<id>:<key>` in localStorage
- `app/tools/<slug>/_app.tsx` — native React apps mounted in-window (no iframe)
- `app/tools/<slug>/page.tsx` — standalone SEO/deep-link pages for each tool
- `app/solutions/tools/*` — secondary tool category (utilities, finance, CRM, etc.)
- `app/tools/_data/tools-list.ts` — registry of every tool, with category, icon,
  and optional `app:` lazy-import for native mounting

## Deploy

Hosted on Vercel, custom domain `spacefield.co`.
