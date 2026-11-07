---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: GUARDRAIL app (all routes)

Scope: the whole authenticated app shell and its five routes. Mode: Operate. Audience: club treasurer (story) and hackathon jury (video at 125%, light mode). Constraints: copy, routes, controls and scene flows unchanged; semantic colours fixed (allow green, block red, approval amber, scam purple), never colour alone; must not look like an official PayPal product.

## Direction contract
THESIS: A payments back-office you would trust with a club's money: the policy engine's verdict is the hero of every screen, shown like a settled transaction. Refuses the generic AI-dashboard (identical icon cards, gradients, glow) and refuses PayPal brand mimicry.
OWN-WORLD: Restrained. Cool white canvas, a slightly cooler grey sidebar, ink-navy primary buttons, one cobalt accent for links, focus and current selection only. Geist Sans for everything, tabular numerals for money, Geist Mono only for IDs. 1px hairline borders with soft offset shadows, 8px radius, status as small dot-plus-label pills. A thin amber "Sandbox · no real money" strip across the top, like a test-mode bar.
STORY: The viewer instantly reads: agent proposes, engine checks against PayPal, money moves or not. They see where each fact came from and that a human approves the irreversible.
FIRST VIEWPORT: Left sidebar with wordmark, five nav items and the reset control (the active policy lives in the Purchasing policy card); content area with page title, one-line description and actions top-right; on Purchasing the request box and, once decided, the verdict directly under it sit above the fold at 1440x900 and 125% zoom.
FORM: Category standard played straight (user chose the canon: Stripe Dashboard, PayPal Business as the craft bar). Seed: canon (no roll).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
