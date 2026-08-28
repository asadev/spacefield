# Spacefield

**A desktop operating system that runs in a browser tab.**

Draggable windows, a dock, a launchpad, wallpapers, multiple workspaces — the
desktop metaphor, rebuilt on the web. Inside it live 126 native apps and tools:
a CRM, a file manager, a task board, a notes app, calculators, content tools,
a WhatsApp inbox, and more. No iframes — every app is a real React component
mounted into a window.

Built with Next.js 16, React 19, Tailwind v4 and Supabase. MIT licensed.

---

## Quick start

```bash
git clone https://github.com/asadev/spacefield.git
cd spacefield
npm install
cp .env.example .env.local     # fill in the three Supabase values
npm run dev                    # http://localhost:3000
```

You need a free [Supabase](https://supabase.com) project. Create one, copy the
URL and the two API keys into `.env.local`, then apply the database schema:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

That's it. Everything else in `.env.example` is optional — leave a key blank
and the feature it powers stays switched off instead of breaking.

---

## What's inside

| | |
|---|---|
| **The shell** | Multi-workspace desktop, window manager, dock, launchpad, command palette, wallpapers, light/dark themes |
| **126 apps** | CRM, files, tasks, notes, projects, people, inbox, calculators, content and SEO tools, converters |
| **Admin panel** | 76 sections — users, roles and permissions, feature flags, runtime config, workflows, custom pages, audit logs |
| **Backend** | 284 API routes, 103 database migrations, row-level security throughout |
| **Extras** | PWA, CSV import/export, full-text and vector search, public REST API, email outbox, RTL support |

## Architecture

```
app/page.tsx                    root route — mounts the desktop
app/tools/_components/          the workspace shell and window manager
app/tools/<slug>/_app.tsx       an app, mounted inside a window
app/tools/<slug>/page.tsx       the same tool as a standalone page
app/tools/_data/tools-list.ts   the registry — add your app here
app/admin/                      admin panel
supabase/migrations/            database schema
```

**To add your own app:** drop a component at `app/tools/<slug>/_app.tsx` and
register it in `tools-list.ts` with a name, category and icon. The launchpad,
dock and search pick it up automatically.

## Scripts

```bash
npm run dev            # development server
npm run build          # production build
npm run lint           # eslint
npm run test           # unit tests
npm run test:e2e       # playwright
```

> **Note:** the build script uses `next build --webpack` deliberately.
> Turbopack has an unresolved regression with this codebase.

## Self-hosting

Deploys to any host that runs Next.js. On a free Vercel account, note two
limits: scheduled jobs only run once a day, and the build container has 8 GB
of memory — this is a large app, so `productionBrowserSourceMaps` is left off
to keep the build inside it.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
For security reports, see [SECURITY.md](SECURITY.md).

## Licence

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Asad Iqbal.

Use it, fork it, sell it. No attribution required beyond keeping the licence
notice.
