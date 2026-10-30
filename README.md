# GUARDRAIL

**Give AI a budget. Not a blank cheque.**

An AI agent that can buy on your behalf, inside a spending policy it cannot bypass. A separate, deterministic policy engine checks the *actual PayPal order* (amount, currency, payee, seller) before any money is captured. Built for the PayPal AI Hackathon 2026.

## Status
- Day 1–2: PayPal sandbox client and spike. Result: **plan A**. After one approval the buyer's wallet is vaulted and the server can authorize later orders without a buyer click.
- Day 3: verified PayPal webhooks (`/api/paypal/webhook`), payment store, demo shops.

## Repo layout
npm workspaces, one Next.js app, one deploy. Dependencies point one way: frontend → backend → services → database → apis.

| Folder | What lives there |
|---|---|
| [`frontend/`](frontend) | Next.js app: pages, components, thin API route handlers |
| [`backend/`](backend) | server runtime: env, logging, errors, health, monitoring, jobs, scripts |
| [`database/`](database) | Postgres/PGlite client, migrations, seed, repositories |
| [`apis/`](apis) | domain types, our HTTP/SSE contracts, UI mocks, PayPal/Channel3/Claude adapters |
| [`services/`](services) | business logic: catalog, payments, policy engine, agent, invoices, disputes, audit |

Plans per layer: [`docs/plans/`](docs/plans). Rules for contributors and agents: [`AGENTS.md`](AGENTS.md).

## Setup
```bash
npm install
cp frontend/.env.example frontend/.env.local   # fill in your PayPal sandbox credentials
npm run dev
npm run check                                  # typecheck + lint + contract check
```

## Deploy on Render
`render.yaml` is a Render Blueprint: one web service (the Next.js app with its API) and one Postgres database in Frankfurt.

1. Render → **New → Blueprint** → connect the GitHub repo → Render reads `render.yaml`.
2. Fill in the values it asks for (`sync: false`): the PayPal sandbox credentials, `PAYPAL_VAULT_ID`, the `PAYEE_EMAIL_*` addresses and `ANTHROPIC_API_KEY`. Without the Anthropic key the app runs in labelled offline test mode.
3. Deploy. On every start `npm run start:render` applies migrations and seeds the demo policy, dispute and invoices (all idempotent), then starts Next.js.
4. Point PayPal at the live URL: `npm run webhook:register -- https://<your-app>.onrender.com` (locally), then copy the new `PAYPAL_WEBHOOK_ID` into Render's environment.
5. Check `https://<your-app>.onrender.com/api/health`: `db`, `paypal` and (with a key) `anthropic` should be `ok`.

## PayPal sandbox spike
Tests the payment side end-to-end: one €89 order authorized and **captured**, one €389 order authorized and **voided** (as the policy engine will do), and whether a saved wallet lets the agent pay without a buyer click.

```bash
npm run spike
```

Needs, in the [PayPal developer dashboard](https://developer.paypal.com/dashboard/) (Sandbox):
1. An app under *Apps & Credentials* → client id + secret into `frontend/.env.local`.
2. A sandbox **personal** account (the buyer) to approve the first order.
3. Optional: a sandbox **business** account with country NL as payee (`PAYEE_EMAIL_NORDIC_GEAR`).

Results are written to `spike-results.json` (git-ignored).

## Webhooks locally
PayPal needs a public URL. Run the app, open a quick tunnel and register it (stores `PAYPAL_WEBHOOK_ID` in `frontend/.env.local`):

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000
npm run webhook:register -- https://<random>.trycloudflare.com
```

Every event is stored in `webhook_events`; only events whose signature PayPal confirms can change a payment. Forged events get `401`, redeliveries are ignored.

## Demo shops
`/shops`: three staged shops. **Nordic Gear** (NL) and **EU SportDirect** (DE) are in GUARDRAIL's seller registry. **DealZone X** is not: its product page hides a prompt injection, and its checkout (`/api/shops/dealzone-x/quote?product=match-balls-20`) adds €49 that the page never showed (€340 → €389).

Each shop is paid through its own sandbox business account (`PAYEE_EMAIL_*` in `frontend/.env.local`), so the policy engine can identify the seller from the PayPal order itself.

## Storage
Postgres when `DATABASE_URL` is set, otherwise embedded PGlite in `.data/` (nothing to install).
