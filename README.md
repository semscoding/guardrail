# GUARDRAIL

**Give AI a budget. Not a blank cheque.**

An AI agent that can buy on your behalf, inside a spending policy it cannot bypass. A separate, deterministic policy engine checks the *actual PayPal order* (amount, currency, payee, seller) before any money is captured. Built for the PayPal AI Hackathon 2026.

## Status
Day 1: Next.js skeleton + PayPal sandbox client and spike.

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
