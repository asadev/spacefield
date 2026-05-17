# Customer logo wall — how to swap in real logos

The landing page (`app/_components/Landing.tsx`) renders a "Trusted by" strip
between the hero and the desktop showcase. Today it shows five grayscale
placeholders living in `public/logos/customer-placeholders/logo-{1..5}.svg`.

When a real customer logo lands, follow the swap procedure below.

## Before you swap

**Permission is mandatory.** A signed permission slip from the customer
authorizing use of their logo on spacefield.co for marketing purposes is
required before publishing. Verbal "yeah it's fine" is not enough — get it
in writing (email reply is fine). Track the artifact in
`docs/marketing/customer-permissions/` (one PDF or `.eml` per customer).

Why this matters: trademark holders can issue takedowns at any time, and a
logo wall on the front door without paper trail is the easiest way to get
one. We've seen this happen on other platforms — don't repeat the mistake.

## Asset spec

- **Format**: SVG (preferred) or PNG at 2× the rendered size (256×96 minimum).
- **Aspect**: 160 × 48 viewBox keeps the strip visually balanced.
- **Color**: Single-color, designed to render in `currentColor` so the
  light/dark theme adapt. If only a multi-color version is available, use
  the grayscale variant — never a full-color logo on a neutral strip; it
  fights the page palette.
- **Padding**: Include ~6px internal padding in the SVG viewBox so the
  logo doesn't crash into adjacent logos.

## Where files live

```
public/logos/customer-placeholders/
  logo-1.svg        ← placeholders we ship with today
  logo-2.svg
  logo-3.svg
  logo-4.svg
  logo-5.svg
```

For real customers, create a sibling directory:

```
public/logos/customers/
  acme-real-estate.svg
  bluefin-properties.svg
  ...
```

The placeholder folder stays in the repo so the page never breaks if a
real-logo swap is reverted.

## Swap procedure

1. Drop the SVG into `public/logos/customers/<customer-slug>.svg`.
2. Update the `CUSTOMER_LOGOS` array in `app/_components/Landing.tsx`:

   ```ts
   const CUSTOMER_LOGOS = [
     { src: "/logos/customers/acme-real-estate.svg", alt: "Acme Real Estate" },
     // …
   ];
   ```

3. The alt text should be the customer's full legal name (used for SEO
   and screen readers).
4. Once five real logos are live, remove the placeholders from the array
   but keep the placeholder SVGs in the repo as a fallback.

## Rotation policy

If we have more than five real customer logos, rotate weekly by reordering
the array. Don't render more than five at once — the strip gets visually
noisy and we lose the "trusted by" weight.

## Quality bar

- No logos of brands we can't actually claim as customers. "Mentioned us in
  passing on Twitter" is not a customer.
- No competitor logos.
- No logos of customers in trial only — wait until they're paying for at
  least one month.
- If a customer churns, remove their logo within 30 days (or sooner if
  they ask).
