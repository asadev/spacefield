# Contributing to Spacefield

Thanks for taking an interest. Spacefield is MIT licensed and open to
contributions of any size — a typo fix is as welcome as a new app.

## Getting set up

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run dev
```

You need a free Supabase project for anything that touches data. Apply the
schema with `npx supabase db push` after linking your project.

## Before you open a pull request

```bash
npm run lint
npm run test
npm run build
```

All three should pass. The build is the real gate — it type-checks the whole
tree, and it is slower than you expect (this is a large app).

## Adding a new app to the desktop

1. Create `app/tools/<your-slug>/_app.tsx` — a normal React component.
2. Register it in `app/tools/_data/tools-list.ts` with a name, category and
   icon.
3. Optionally add `app/tools/<your-slug>/page.tsx` so it also works as a
   standalone page.

The launchpad, dock, search and sitemap pick it up from the registry.

## House rules for the codebase

- **Next.js 16 export rules are strict.** `route.ts` files export HTTP
  handlers only; `"use server"` files export async functions only; page files
  export only the approved page exports. Put helpers and types in a sibling
  `_name.ts` file.
- **Row-level security is not optional.** Every table that holds user data has
  RLS policies. If you add a table, add its policies in the same migration.
- **Migrations are append-only.** Add a new timestamped file in
  `supabase/migrations/`; never edit one that has already been applied.
- Match the style of the file you are editing rather than reformatting it.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. A
minimal reproduction saves everyone time.

Security issues go to [SECURITY.md](SECURITY.md), not the public tracker.
