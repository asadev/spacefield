# Space Field — App Icon Design Brief

This is the prompt to paste into Claude Design (or any equivalent
generator) to create custom icons for each tool inside Space Field.

We start with **6 real estate apps** to lock in the visual style.
Once we've picked a direction, we'll roll the same treatment across
the remaining ~130 tools.

---

## Prompt to paste

```
You are designing a set of app icons for Space Field — a multi-workspace
desktop OS in the browser at spacefield.co. It works exactly like macOS:
each tool inside opens as a draggable window with its own icon in the
dock and Launchpad. Today every tool uses a generic glyph; we want each
one to feel like a real, standalone app — distinct, recognizable, and
cohesive as a family.

PRODUCT CONTEXT
- Space Field is a desktop OS in the browser. Users can create multiple
  named workspaces (e.g. "Real Estate", "Marketing"), invite collaborators
  with roles (owner / admin / member), and use whichever tools the workspace
  has installed. Tools open in floating windows, pinned to a bottom dock,
  searchable via Launchpad.
- Tools are organized by category: real estate (intelligence, research,
  calculators, investment, agent, compliance), business (finance, sales,
  CRM, marketing, productivity, support, legal, content, design, dev,
  data). 138 tools total.
- Aesthetic: native macOS feel. Foundation tokens are dark + light theme
  with a violet accent (#7c3aed light / #8b5cf6 dark). Wallpapers can be
  gradients, photos, or interactive canvases.

STYLE DIRECTION (please produce variants for the first 6 so we can pick)

Variant A — Apple HIG (macOS Sonoma / Big Sur style):
  • 1024×1024 squircle (rounded square with continuous corners,
    superellipse curve)
  • Subtle gradient background per category (real estate = ocean blue
    fading darker; calculators = soft teal; etc.)
  • One bold central glyph in white or off-white, slightly inset shadow
    so it appears physical on the squircle
  • Subtle inner glow / specular highlight along top edge
  • Slight drop shadow under the icon when placed on a surface

Variant B — Flat / abstract:
  • 512×512, fully flat, no gradient
  • Geometric, monoline glyphs
  • Two-tone: violet accent + neutral background
  • More minimal, more "Tailwind dashboard" than "macOS"

Variant C — Glassmorphism:
  • 1024×1024 squircle
  • Translucent / glass background showing wallpaper through
  • Bold colored glyph inside
  • Modern, photo-y, looks great on photo wallpapers

Pick whichever you think is strongest, but produce all three for each of
the 6 icons below so we can compare side-by-side.

CONSTRAINTS
- Output as SVG (preferred) or PNG with transparent background.
- 1024×1024 master size. We'll downscale to 64, 128, 256 in code.
- Each icon must be distinct enough that you can tell two icons apart at
  64×64 with no label.
- Read clearly at small sizes — avoid fine type, fine lines, or
  decorative noise that disappears below 32px.
- The 6 icons should feel like one family: the chrome (squircle, gradient
  treatment) is consistent; only the glyph + tint changes per app.

THE 6 APPS (real estate, starter batch)

1. Property Valuation
   What it does: instant valuation of a property in AED/USD with a
   confidence band, comparables, and breakdown of square-footage premium.
   Concept: a house with a value tag, OR a stylized appraisal certificate,
   OR a gauge/dial showing valuation confidence. Tint: trust / appraisal —
   deep blue or navy.

2. Deal Scoring
   What it does: paste any listing and get a 0–100 score across yield,
   valuation, risk, and timing.
   Concept: a target / scorecard / shield with a number, OR a stylized
   "A" grade letter. Tint: signal / decision — emerald or amber.

3. Yield Heatmap
   What it does: interactive map of Dubai (and global cities) showing
   rental yield per zone. Click any area, see the average gross yield.
   Concept: a stylized city block grid with heat colors, OR a location
   pin with a percent symbol, OR layered topographic contours. Tint:
   spectral (cool-to-warm gradient is actually meaningful here).

4. Mortgage Calculator
   What it does: input price, down payment, term, rate; get monthly
   payment, total interest, amortization.
   Concept: a house with a percent symbol on the door, OR a stack of
   coins with a key on top, OR a simplified amortization curve. Tint:
   finance — gold / muted yellow.

5. Neighborhood Report
   What it does: a quality scorecard for any neighborhood — schools,
   transit, walkability, amenities, demographics.
   Concept: a stylized map zoomed in with a star / report card overlay,
   OR a building skyline with rating bars. Tint: discovery — coral or
   warm orange.

6. Market Pulse
   What it does: live market metrics — AED/sqft, yield, transaction
   volume — updating in real time.
   Concept: a pulse / EKG line over a chart background, OR a stylized
   heartbeat icon. Tint: energy / live — magenta or hot pink.

DELIVERABLES
- 6 icons × 3 style variants = 18 master files, plus a one-row contact
  sheet showing all 6 in each variant for side-by-side comparison.
- Name files as: <slug>__variant-<a|b|c>.svg
  e.g. property-valuation__variant-a.svg
- Include the contact sheets named: contact-sheet__variant-a.png (etc).

We'll pick a winning variant + adjust details, then commission the same
treatment for the remaining 132 tools in waves.
```

---

## Tools we'll commission next (after the 6-icon style is locked)

Real estate (22 more): area-comparison, due-diligence, global-market-comparison,
golden-visa-checker, property-comparison, service-charge-comparison,
tenant-screening, developer-pipeline, developer-track-record,
affordability, dld-fee-calculator, commission-calculator, roi-calculator,
rent-vs-buy, cash-flow-modeler, portfolio-tracker, investment-advisor,
investment-simulator, offplan-analyzer, property-poster-creator,
sales-offer-generator, regulation-monitor.

Business + general (110 tools across finance, sales, CRM, marketing,
productivity, support, legal, content, design, dev, data) — see
`app/tools/_data/tools-list.ts` and `app/solutions/tools/*` for the
full list.
