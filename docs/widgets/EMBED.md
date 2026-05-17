# Embeddable Widgets — `/embed/<tool-id>`

A small set of Spacefield tools is exposed at `https://spacefield.co/embed/<tool-id>`
for customers to iframe into their own websites.

## Available widgets

| Tool ID                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `mortgage-calculator`   | Monthly payment + total interest for a fixed-rate loan. |
| `roi-calculator`        | Total return %, net profit, CAGR over a holding period. |

## How to embed

```html
<iframe
  src="https://spacefield.co/embed/mortgage-calculator"
  width="100%"
  height="640"
  style="border: 0; max-width: 640px;"
  loading="lazy"
  title="Mortgage Calculator"
></iframe>
```

For the ROI calculator, swap `mortgage-calculator` for `roi-calculator`.

### Sizing

The widgets are responsive down to ~320px wide. Set `height` to roughly
`640` for desktop and `780` for mobile to avoid scrollbars. The internal
grid is `auto-fit / minmax(140px, 1fr)`, so inputs wrap cleanly.

### Theming

Widgets are **light-mode-locked**. Customer sites that force dark mode
on iframes will still render with the widget's own light palette. This
is intentional — it keeps rendering predictable across thousands of
unknown parent sites.

## Why a separate route from `/tools/<id>`

`/tools/<id>` is the in-workspace native app: framer-motion charts, canvas
amortisation graphs, XP awards, Supabase, auth gate. None of that makes
sense inside a customer iframe — too heavy, too branded, requires auth.

`/embed/<id>` is the stripped-down calc: principal/rate/term in,
monthly/total/interest out, inline styles, no Spacefield design tokens,
no external state.

## CSP

The CSP middleware (`lib/security-headers.ts`, SE-008) drops
`X-Frame-Options` and `frame-ancestors` for the `/embed/*` path namespace
specifically so any origin can frame these routes. CSP otherwise stays
intact — script-src, img-src etc. are unchanged.

## Adding a new widget

1. Drop a self-contained client component in
   `app/embed/_components/<Name>Widget.tsx`. Constraints:
   - No framer-motion (slow on cold network).
   - No Spacefield design tokens (`--tool-accent` etc).
   - No fetch / Supabase / auth.
   - Inline styles. Light palette only.
2. Register it in the `WIDGETS` array in `app/embed/[toolId]/page.tsx`.
3. Add a row to the table at the top of this file.

That's it — the route is `generateStaticParams`-driven so new entries
are statically rendered at build time.
