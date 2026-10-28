# GUARDRAIL

**Give AI a budget. Not a blank cheque.**

An AI agent that can buy on your behalf, inside a spending policy it cannot bypass. A separate, deterministic policy engine checks the *actual PayPal order* (amount, currency, payee, seller) before any money is captured. Built for the PayPal AI Hackathon 2026.

## Status
- Day 1–2: PayPal sandbox client and spike. Result: **plan A**. After one approval the buyer's wallet is vaulted and the server can authorize later orders without a buyer click.
- Day 3: verified PayPal webhooks (`/api/paypal/webhook`), payment store, demo shops.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in your PayPal sandbox credentials
npm run dev
```

## PayPal sandbox spike
Tests the payment side end-to-end: one €89 order authorized and **captured**, one €389 order authorized and **voided** (as the policy engine will do), and whether a saved wallet lets the agent pay without a buyer click.

```bash
npm run spike
```

Needs, in the [PayPal developer dashboard](https://developer.paypal.com/dashboard/) (Sandbox):
1. An app under *Apps & Credentials* → client id + secret into `.env.local`.
2. A sandbox **personal** account (the buyer) to approve the first order.
3. Optional: a sandbox **business** account with country NL as payee (`PAYEE_EMAIL_NORDIC_GEAR`).

Results are written to `spike-results.json` (git-ignored).

## Webhooks locally
PayPal needs a public URL. Run the app, open a quick tunnel and register it (stores `PAYPAL_WEBHOOK_ID` in `.env.local`):

```bash
npm run dev
cloudflared tunnel --url http://localhost:3000
npm run webhook:register -- https://<random>.trycloudflare.com
```

Every event is stored in `webhook_events`; only events whose signature PayPal confirms can change a payment. Forged events get `401`, redeliveries are ignored.

## Demo shops
`/shops`: three staged shops. **Nordic Gear** (NL) and **EU SportDirect** (DE) are in GUARDRAIL's seller registry. **DealZone X** is not: its product page hides a prompt injection, and its checkout (`/api/shops/dealzone-x/quote?product=match-balls-20`) adds €49 that the page never showed (€340 → €389).

Each shop is paid through its own sandbox business account (`PAYEE_EMAIL_*` in `.env.local`), so the policy engine can identify the seller from the PayPal order itself.

## Storage
Postgres when `DATABASE_URL` is set, otherwise embedded PGlite in `.data/` (nothing to install).
