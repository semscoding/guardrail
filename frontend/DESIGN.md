---
name: GUARDRAIL
description: Give AI a budget, not a blank cheque. A calm, auditable spend-control console.
colors:
  surface: "#f5f7fa"
  surface-raised: "#ffffff"
  surface-subtle: "#eff2f6"
  surface-sidebar: "#fbfcfd"
  ink: "#0b1628"
  ink-secondary: "#3a4657"
  ink-muted: "#586474"
  border: "#e2e7ee"
  border-strong: "#c7d0db"
  brand: "#0e2240"
  brand-foreground: "#ffffff"
  accent-ink: "#2449c9"
  accent-soft: "#edf1fd"
  allow: "#0b7348"
  allow-soft: "#eaf6f0"
  allow-border: "#a9dbc4"
  block: "#c0291b"
  block-soft: "#fdeeec"
  block-border: "#f2b8b0"
  approval: "#9c4f00"
  approval-soft: "#fff4e6"
  approval-border: "#f2c990"
  scam: "#7429b6"
  scam-soft: "#f6effd"
  scam-border: "#d8bdf3"
  sandbox: "#7a4a00"
  sandbox-soft: "#fff1d6"
  sandbox-border: "#f1d29a"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "2.875rem"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.125rem"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  card: "20px"
  section: "24px"
  cluster: "12px"
  page-x: "24px"
  page-y: "28px"
  header: "56px"
  sidebar: "248px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.block}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  badge-allow:
    backgroundColor: "{colors.allow-soft}"
    textColor: "{colors.allow}"
    rounded: "{rounded.pill}"
  badge-block:
    backgroundColor: "{colors.block-soft}"
    textColor: "{colors.block}"
    rounded: "{rounded.pill}"
  badge-approval:
    backgroundColor: "{colors.approval-soft}"
    textColor: "{colors.approval}"
    rounded: "{rounded.pill}"
  badge-scam:
    backgroundColor: "{colors.scam-soft}"
    textColor: "{colors.scam}"
    rounded: "{rounded.pill}"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    height: "36px"
---

# Design System: GUARDRAIL

## Overview

**Creative North Star: "The Auditable Ledger"**

A payments-console register: cool paper-grey canvas, white panels, ink-navy for the one primary action, and four fixed verdict colours that carry product meaning. Density is moderate and tabular; the craft bar is Stripe Dashboard / PayPal Business clarity, without imitating any PayPal brand asset (the BrandMark is an original shield-and-rail). Light mode is primary and must stay legible at 125% zoom in video; a dark layer exists (`.dark` on html) but is opt-in.

**Key Characteristics:**
- Restrained: neutrals plus ink-navy; one cobalt accent for links, focus, selection and active nav.
- Verdicts (allow / block / approval / scam) are fixed meaning and always icon plus words.
- Hairline borders and a soft two-layer shadow; no decoration.
- One orchestrated motion moment per decision, nothing ambient.

## Colors

Cool neutral, navy-anchored, with traffic-light-plus-purple semantics. Values live in the frontmatter; roles below.

### Primary
- **Ink Navy** (`brand`): primary buttons, brand mark tile, default badge. Inverts to near-white in dark.
- **Cobalt** (`accent-ink`, with `accent-soft` wash): links, focus ring, selection, active nav, selected grid row. Never a verdict colour.

### Neutral
- **Paper** (`surface`) page canvas; **Raised White** (`surface-raised`) panels; **Subtle** (`surface-subtle`) hover and secondary fills; **Sidebar** (`surface-sidebar`).
- **Ink / Ink Secondary / Ink Muted** for text hierarchy (muted is #586474, tuned for AA on paper).
- **Border / Border Strong** for hairlines and input/outline-button strokes.

### Verdict (fixed product meaning)
- **Allow** green, **Block** red, **Approval** amber, **Scam** violet; each has `-soft` fill and `-border` stroke. **Sandbox** amber-brown marks the environment bar only.

### Named Rules
**The Never-Colour-Alone Rule.** Every verdict pairs colour with a distinct icon shape and a text label (OutcomeBadge, VerdictBanner, RuleChecklist: CircleCheck / CircleX / Hand / CircleDashed).
**The Fixed Meaning Rule.** Allow/block/approval/scam colours are never reused for decoration, charts of unrelated data, or brand accents.

## Typography

**Display / Body:** Geist (next/font, `--font-geist-sans`), fallback ui-sans-serif, system-ui. **Mono:** Geist Mono (`--font-geist-mono`) is loaded and aliased as `font-mono`. Body carries `ss01`, `cv11` and -0.006em tracking.

**Character:** neutral, engineered, slightly tight at headings.

### Hierarchy
- **Verdict title** (600, 1.75rem/2.25rem, -0.02em, tabular-nums): VerdictBanner.
- **Page title** (600, 1.5rem, 1.75rem at sm, -0.02em): PageHeader h1.
- **Card/section title** (600, 15px to 1rem): CardTitle, ledger h2.
- **Body** (400, 15px/24px for descriptions; 14px/21px `text-sm` for tables and controls).
- **Label** (500, 12px; table headers uppercase at 0.04em in RuleChecklist; AG Grid header 12px/500, muted).
- Scale tokens: xs 12, sm 14, base 16, lg 18, xl 21, 2xl 24, 3xl 30, display 40.

### Named Rules
**The Tabular Money Rule.** Amounts and counts use tabular-nums (`td`, `.tabular`, `[data-amount]`) so columns align.

## Layout

App shell: EnvironmentBar on top, 248px sidebar (`AppNav` vertical) from `lg`, five-up bottom/tab row below. PageShell is the single `<main id="main-content">`, max 84rem, px 16 / 32 at md, py 24 / 32, with 24px (`section`) vertical gap between blocks. Card padding 20px; clusters 12px. Skip link is first in the DOM. Tables collapse their header on small screens (`md:table-header-group`).

## Elevation & Depth

Hairline-border first, shadow second. Hybrid, quiet.
- **Card** (`--shadow-card`: `0 1px 2px rgb(11 22 40/.05), 0 2px 8px -2px rgb(11 22 40/.06)`): panels, banners.
- **Raised** (`--shadow-raised`: `0 2px 4px .., 0 12px 28px -8px rgb(11 22 40/.14)`): popovers and overlays only.
- Buttons carry a 1px ink shadow (primary adds an inset top highlight).

**The Quiet Shadow Rule.** Shadows are soft, low-opacity, ink-tinted. No hard offset or coloured shadows.

## Shapes

Soft-rectangular: 6 / 8 / 10 / 14px scale. Buttons, nav items and inputs 8px; cards and banners 10px; badges full pill; BrandMark tile 7px; AG Grid wrapper 8px. Focus ring: 2px `--ring` outline, 2px offset.

## Components

### Buttons
Shadcn cva. Height 36 (default), 32 (sm), 40 (lg), 36 square (icon); 14px semibold; 8px radius. Variants: default (ink navy), destructive (block red), outline (white, strong border), secondary, ghost, link (cobalt). Hover shifts fill (`brand/88`); active `scale(0.98)`; disabled 50% opacity; 150ms ease-out-quart.

### Cards / panels
`<Card>`: raised white, 10px radius, 1px border, `shadow-card`, `p-card`, 16px gap. **Pattern as shipped:** some panels (e.g. RuleChecklist) use the inline equivalent `rounded-lg border border-border bg-surface-raised shadow-card p-card` instead of `<Card>`. Treat the two as the same component; prefer `<Card>` for new work.

### Badges and verdicts
`Badge` is a pill, 12px/500, soft fill plus border. `OutcomeBadge` always adds a lucide icon (CheckCircle2, OctagonX, ClockAlert, ShieldAlert) and a label. `VerdictBanner` (`role="status"`): soft-tone panel, 48px white circular icon, 1.75rem title, 15px body, enters with `gr-stamp`.

### Inputs
Shared class `gr-field` is referenced by InvoiceGuard, ResetDemoButton, AuditGrid selects. Caret is cobalt. Defined once in `globals.css` (`@layer components`): hairline `border-strong`, inset shadow, cobalt border plus 3px `accent-soft` halo on focus. The Purchasing request input uses it too.

### Navigation
AppNav: 36px rows, 14px, icon 18px stroke 1.75. Active: `accent-soft` fill, cobalt text, semibold, `aria-current="page"`. Inactive: ink-secondary, subtle hover.

### Audit grid
AG Grid Quartz with token params: surface-raised rows, `surface` header with muted 12px/500 text, 48px rows, 40px header, 16px cell padding, cobalt accent, accent-soft selection, 8px wrapper radius.

### Motion
`gr-enter` 200ms (rows rise 4px from 0.45 opacity), `gr-pop` 220ms (result icon scale .7 to 1), `gr-stamp` 260ms (verdict scale .985 to 1), all `cubic-bezier(0.23,1,0.32,1)`. Keyframes start visible. Reduced motion disables all.

**The One Moment Rule.** Rows arrive as checks resolve, the icon settles, the verdict lands once. Nothing else animates on its own.

## Do's and Don'ts

### Do:
- **Do** pair every verdict colour with its icon and words.
- **Do** use token classes (`bg-surface-raised`, `text-ink-secondary`), never raw hex in components.
- **Do** keep body text at 14px or above and verdicts large enough for 125% zoom video.
- **Do** keep the cobalt accent for interactive state only.

### Don't:
- **Don't** imitate PayPal's logo, wordmark, or colours.
- **Don't** use verdict colours as decoration or the accent as a verdict.
- **Don't** add ambient or looping animation, or motion that hides content when it fails to run.
- **Don't** introduce hard offset shadows, gradients, or side-stripe borders.
