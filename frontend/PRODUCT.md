# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary (in the story):** the volunteer treasurer or kit manager of an amateur sports club. Gives an AI agent a monthly budget for club supplies, answers to the board for every euro, is a target for fake "renewal" invoices, and handles PayPal disputes when the club shop sells shirts.
- **Primary (in practice):** the PayPal AI Hackathon 2026 jury, who see the product mostly through a ~3-minute demo video (no live pitch) and possibly a live link until 21-12-2026.

## Product Purpose
GUARDRAIL lets an AI agent spend within a spending policy it cannot bypass. The agent searches and proposes; a separate deterministic policy engine reads the real PayPal order (amount, payee, seller) and only then captures or voids. Tagline: "Give AI a budget. Not a blank cheque." Success: the jury understands within seconds that the AI decides *what* to buy, never *whether* money moves.

## Positioning
The AI may claim nothing; every claim is checked against the source (PayPal order, seller registry, ledger). Three pillars: Autonomous Purchasing (R1–R10 checked before capture), Invoice Shield (scam invoices, payee denylist R10), Dispute Defender (evidence-backed dispute responses, approved by a human).

## Operating Context
Next.js app on PayPal sandbox; recorded at 125% zoom in light mode for the video. Scenes: (1) allowed €89 first-aid purchase, (2) blocked €389 DealZone X purchase with prompt injection, optionally via the labelled "Simulate a compromised agent" demo setting, (3) disputes and invoices. Approval on a phone (375 px) for NEEDS_APPROVAL.

## Capabilities and Constraints
- Routes: `/` overview, `/purchasing`, `/disputes`, `/invoices`, `/audit` (AG Grid Community), demo shop pages under `/shops`.
- Copy, routes, controls and scene flows are fixed; a redesign changes presentation only.
- Semantic colour meaning is fixed: allow = green, block = red, needs approval = amber/orange, scam = purple. Colour is never the only carrier of meaning.
- Light mode is the primary theme; dark mode stays supported.
- Offline/compromised modes must always be visibly labelled; nothing fake may look like real AI or real money.

## Brand Commitments
- Name GUARDRAIL. Sits in the PayPal ecosystem but must **not** look like an official PayPal product: no PayPal logo, wordmark styling or brand-colour mimicry; "PayPal sandbox" appears only as functional context.
- Craft references (bar, not to copy): Stripe Dashboard, PayPal Business.

## Evidence on Hand
Real sandbox runs (captured, voided, authorized), audit hash chain, demo shops and seeded invoices/disputes. No customers, testimonials or metrics exist; never fabricate them.

## Product Principles
1. Source over claim: show where every fact came from.
2. A human approves anything irreversible above the threshold.
3. Legible in a video: large enough, calm enough, one thing happening at a time.
4. Honest labelling of every simulated or offline mode.

## Accessibility & Inclusion
WCAG 2.2 AA; accesslint check before submission (vault standard). Meaning never by colour alone.
