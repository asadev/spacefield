# create-spacefield

Set up [Spacefield](https://spacefield.co) — an open-source desktop OS that runs
in a browser tab — in one command.

```bash
npx create-spacefield my-workspace
```

It downloads the latest source, writes a `.env.local` from the documented
example, and installs dependencies with whichever package manager you used
(npm, pnpm, yarn or bun).

After that you need a free [Supabase](https://supabase.com) project. Put the
three Supabase values into `.env.local`, apply the schema, and start it:

```bash
cd my-workspace
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npm run dev
```

Every other setting in `.env.local` is optional — leave a key blank and the
feature it powers stays switched off rather than breaking.

MIT licensed. Source: <https://github.com/asadev/spacefield>
