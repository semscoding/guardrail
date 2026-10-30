// Staged scenario for Invoice Shield: sends a real PayPal sandbox invoice from a "scammer" sandbox
// business account to the club, so the invoice number and payee are real. In the pitch we say so:
// "staged scam invoice; in production invoices arrive via forwarded email".
//
// Needs, in frontend/.env.local (never committed):
//   SCAMMER_CLIENT_ID, SCAMMER_CLIENT_SECRET   REST app of the scammer sandbox business account
//   SCAM_INVOICE_RECIPIENT                      the club's sandbox email that receives the invoice
// Run: npm run invoices:stage-scam

import { mockInvoices } from "@guardrail/apis/mocks";

const BASE_URL = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";

async function main() {
  const clientId = process.env.SCAMMER_CLIENT_ID;
  const secret = process.env.SCAMMER_CLIENT_SECRET;
  const recipient = process.env.SCAM_INVOICE_RECIPIENT;
  const missing = [
    !clientId && "SCAMMER_CLIENT_ID",
    !secret && "SCAMMER_CLIENT_SECRET",
    !recipient && "SCAM_INVOICE_RECIPIENT",
  ].filter(Boolean);
  if (missing.length) {
    console.log(
      `Not staging a scam invoice: set ${missing.join(", ")} in frontend/.env.local first.\n` +
        "Create a separate sandbox business account (the \"scammer\") with its own REST app for this.",
    );
    return;
  }
  if (!BASE_URL.includes("sandbox")) throw new Error("Refusing to stage a scam invoice outside the PayPal sandbox.");

  const tokenRes = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error(`PayPal token request failed (${tokenRes.status})`);
  const { access_token: token } = (await tokenRes.json()) as { access_token: string };

  const scam = mockInvoices.find((i) => i.id === "inv_scam_1");
  if (!scam?.amount) throw new Error("Scam mock invoice is missing");
  const value = `${Math.trunc(scam.amount.cents / 100)}.${String(scam.amount.cents % 100).padStart(2, "0")}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const draftRes = await fetch(`${BASE_URL}/v2/invoicing/invoices`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      detail: {
        currency_code: scam.amount.currency,
        note: scam.text,
        memo: "GUARDRAIL staged scam invoice (sandbox demo)",
      },
      primary_recipients: [{ billing_info: { email_address: recipient } }],
      items: [
        {
          name: "Geek Squad Total Protection renewal",
          quantity: "1",
          unit_amount: { currency_code: scam.amount.currency, value },
        },
      ],
    }),
  });
  if (!draftRes.ok) throw new Error(`Creating the draft invoice failed (${draftRes.status}): ${await draftRes.text()}`);
  const draft = (await draftRes.json()) as { id: string; detail?: { invoice_number?: string } };

  const sendRes = await fetch(`${BASE_URL}/v2/invoicing/invoices/${draft.id}/send`, {
    method: "POST",
    headers,
    body: JSON.stringify({ send_to_recipient: true }),
  });
  if (!sendRes.ok) throw new Error(`Sending invoice ${draft.id} failed (${sendRes.status}): ${await sendRes.text()}`);
  console.log(`Sent staged scam invoice ${draft.id} (number ${draft.detail?.invoice_number ?? "?"}) to the club account.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
