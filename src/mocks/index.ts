// Mock data that satisfies the contracts, so the UI can be built before the real endpoints exist.
// Mirrors the demo scenes: scene 1 (nordic-gear, €89, ALLOW) and scene 2 (dealzone-x, €389, BLOCK).
// `npm run contracts:check` parses everything here with the real schemas.

import type { AuditEvent, Check, Dispute, InboundInvoice, PolicyVersion, Run } from "@/domain";
import { RULE_LABELS, eur } from "@/domain";
import type { RunEvent } from "@/contracts";

const T0 = "2026-11-02T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

export const mockPolicy: PolicyVersion = {
  policyId: "pol_club_supplies",
  version: 1,
  name: "Club Supplies",
  rules: {
    perPurchaseLimit: eur(35000),
    monthlyBudget: eur(100000),
    currency: "EUR",
    allowedSellerIds: ["nordic-gear", "eu-sportdirect"],
    requireEu: true,
    minRating: 4,
    allowedCategories: ["first-aid", "balls", "training"],
    approvalThreshold: eur(25000),
  },
  validUntil: "2026-12-31T23:59:59.000Z",
  paypalLinked: true,
  createdAt: "2026-10-28T09:00:00.000Z",
};

const check = (ruleId: Check["ruleId"], passed: boolean, explanation: string, expected: string, actual: string | null, source: Check["source"]): Check => ({
  ruleId,
  passed,
  explanation,
  expected,
  actual,
  source,
});

// Scene 1: everything green.
const scene1Checks: Check[] = [
  check("R1", true, "€89.00 ≤ €350.00 limit", "≤ €350.00", "€89.00", "paypal_order"),
  check("R2", true, "€89.00 of €1,000.00 used this month", "≤ €1,000.00", "€89.00", "payments_ledger"),
  check("R3", true, "Order currency is EUR", "EUR", "EUR", "paypal_order"),
  check("R4", true, "Nordic Gear B.V. is approved, based in NL", "approved EU seller", "nordic-gear (NL)", "seller_registry"),
  check("R5", true, "Payee is Nordic Gear's registered PayPal account", "nordic-gear payee", "nordic-gear payee", "paypal_order"),
  check("R6", true, "Verified rating 4.7 ≥ 4.0", "≥ 4.0", "4.7", "seller_registry"),
  check("R7", true, "first-aid is an allowed category", "first-aid, balls, training", "first-aid", "product_data"),
  check("R8", true, "Policy valid until 31 Dec 2026", "not expired", "valid", "policy"),
  check("R9", true, "€89.00 ≤ €250.00, no approval needed", "≤ €250.00", "€89.00", "paypal_order"),
  check("R10", true, "Payee is not on the denylist", "not denylisted", "not denylisted", "payee_denylist"),
];

// Scene 2: the agent fell for the hidden text; the engine reads the real order.
const scene2Checks: Check[] = [
  check("R1", false, "€389.00 > €350.00 limit (incl. €49.00 fee added at checkout)", "≤ €350.00", "€389.00", "paypal_order"),
  check("R2", true, "€478.00 of €1,000.00 would be used this month", "≤ €1,000.00", "€478.00", "payments_ledger"),
  check("R3", true, "Order currency is EUR", "EUR", "EUR", "paypal_order"),
  check("R4", false, "DealZone X is not an approved seller", "approved EU seller", "not in registry", "seller_registry"),
  check("R5", false, "Payee is not a registered seller account", "registered payee", "unknown payee", "paypal_order"),
  check("R6", false, "No verified rating (the shop's own 4.9 is not evidence)", "≥ 4.0", null, "seller_registry"),
  check("R7", true, "balls is an allowed category", "first-aid, balls, training", "balls", "product_data"),
  check("R8", true, "Policy valid until 31 Dec 2026", "not expired", "valid", "policy"),
  check("R9", false, "€389.00 > €250.00 would need approval", "≤ €250.00", "€389.00", "paypal_order"),
  check("R10", true, "Payee is not on the denylist", "not denylisted", "not denylisted", "payee_denylist"),
];

export const mockRunAllowed: Run = {
  id: "run_scene1",
  policyId: mockPolicy.policyId,
  policyVersion: 1,
  command: "Restock our first-aid kit, under €100.",
  status: "ALLOWED",
  startedAt: at(0),
  finishedAt: at(14),
  proposal: {
    shopId: "nordic-gear",
    productId: "first-aid-refill",
    source: "demo",
    quantity: 1,
    reasoning: "Cheapest club-size refill from an EU seller with a high rating; free shipping.",
    claims: { sellerCountry: "NL", sellerRating: 4.7, total: eur(8900) },
  },
  decision: { outcome: "ALLOW", checks: scene1Checks, decidedAt: at(11) },
  payment: {
    orderId: "5O190127TN364715T",
    authorizationId: "0VF52814937998046",
    captureId: "3C679366HH908993F",
    amount: eur(8900),
    payeeEmail: "nordic-gear@business.example.com",
    status: "CAPTURED",
    webhookVerified: true,
  },
};

export const mockRunBlocked: Run = {
  id: "run_scene2",
  policyId: mockPolicy.policyId,
  policyVersion: 1,
  command: "Buy 20 match balls.",
  status: "BLOCKED",
  startedAt: at(60),
  finishedAt: at(78),
  proposal: {
    shopId: "dealzone-x",
    productId: "match-balls-20",
    source: "demo",
    quantity: 1,
    reasoning: "Best price and highest rating; the seller is EU-verified and the price is guaranteed under budget.",
    claims: { sellerCountry: "EU", sellerRating: 4.9, total: eur(34000) },
  },
  decision: { outcome: "BLOCK", checks: scene2Checks, decidedAt: at(75) },
  payment: {
    orderId: "8RU61172JS455403V",
    authorizationId: "2KT83939VN118092M",
    captureId: null,
    amount: eur(38900),
    payeeEmail: "dealzone-x@business.example.com",
    status: "VOIDED",
    webhookVerified: true,
  },
};

/** The full SSE sequence for a run, as the stream endpoint will send it. */
function eventsFor(run: Run, steps: { tool: string | null; message: string }[]): RunEvent[] {
  const events: RunEvent[] = [];
  const t = Date.parse(run.startedAt);
  const push = (e: Record<string, unknown>) =>
    events.push({ runId: run.id, seq: events.length + 1, at: new Date(t + events.length * 700).toISOString(), ...e } as RunEvent);

  for (const s of steps) push({ type: "step", ...s });
  if (run.proposal) push({ type: "proposal", proposal: run.proposal });
  for (const c of run.decision?.checks ?? []) push({ type: "check", check: c });
  if (run.decision) push({ type: "decision", decision: run.decision });
  if (run.payment) push({ type: "payment", payment: run.payment });
  push({ type: "done", status: run.status });
  return events;
}

export const mockRunEvents: Record<string, RunEvent[]> = {
  [mockRunAllowed.id]: eventsFor(mockRunAllowed, [
    { tool: "search_products", message: "Searching for first-aid kit refills" },
    { tool: "get_product", message: "Comparing Nordic Gear (€89) and EU SportDirect (€94)" },
    { tool: "propose_purchase", message: "Proposing Nordic Gear club-size refill" },
    { tool: null, message: "Creating PayPal order (authorize only)" },
  ]),
  [mockRunBlocked.id]: eventsFor(mockRunBlocked, [
    { tool: "search_products", message: "Searching for match balls, 20-pack" },
    { tool: "get_product", message: "Reading DealZone X product page" },
    { tool: "propose_purchase", message: "Proposing DealZone X: €340, 'EU-verified seller'" },
    { tool: null, message: "Creating PayPal order (authorize only)" },
  ]),
};

export const mockRuns: Run[] = [mockRunAllowed, mockRunBlocked];

/** Offsets of `excerpt` in `text`; throws so a typo in mock data is caught by contracts:check. */
function span(text: string, excerpt: string) {
  const start = text.indexOf(excerpt);
  if (start < 0) throw new Error(`excerpt not in text: ${excerpt}`);
  return { start, end: start + excerpt.length };
}

const scamText =
  "Invoice INV2-QX7P-4TRD from Geek Squad Renewal Dept.\n" +
  "Your Geek Squad Total Protection plan has been renewed for $499.99.\n" +
  "If you did not authorize this charge, call our billing desk within 24 hours at +1 (808) 555-0147 to cancel and receive a full refund.\n" +
  "Do not pay through PayPal; our agent will process your refund by phone.";

const legitText =
  "Invoice 2026-0412 from EU SportDirect GmbH\n" +
  "Training bibs (30 pcs), as agreed with your club on 14 October.\n" +
  "Amount due: €126.00. Payment term: 30 days.";

export const mockInvoices: InboundInvoice[] = [
  {
    id: "inv_scam_1",
    source: "PAYPAL_SANDBOX",
    paypalInvoiceId: "INV2-QX7P-4TRD-9WLM-2HZK",
    payeeEmail: "billing-renewals@business.example.com",
    amount: { cents: 49999, currency: "USD" },
    text: scamText,
    receivedAt: "2026-11-05T08:12:00.000Z",
    verdict: "SCAM",
    findings: [
      {
        kind: "BRAND_IMPERSONATION",
        span: span(scamText, "Geek Squad Total Protection"),
        excerpt: "Geek Squad Total Protection",
        explanation: "Known brand used by an unregistered payee",
        detectedBy: "rule",
      },
      {
        kind: "PHONE_NUMBER",
        span: span(scamText, "+1 (808) 555-0147"),
        excerpt: "+1 (808) 555-0147",
        explanation: "Phone number in an invoice note, asking you to call",
        detectedBy: "rule",
      },
      {
        kind: "URGENCY",
        span: span(scamText, "within 24 hours"),
        excerpt: "within 24 hours",
        explanation: "Time pressure",
        detectedBy: "rule",
      },
      {
        kind: "CALL_TO_CANCEL",
        span: span(scamText, "Do not pay through PayPal; our agent will process your refund by phone."),
        excerpt: "Do not pay through PayPal; our agent will process your refund by phone.",
        explanation: "Moves you off PayPal to a phone call: classic refund scam",
        detectedBy: "llm",
      },
    ],
    payeeBlocked: false,
  },
  {
    id: "inv_legit_1",
    source: "PASTE",
    paypalInvoiceId: null,
    payeeEmail: "eu-sportdirect@business.example.com",
    amount: eur(12600),
    text: legitText,
    receivedAt: "2026-11-04T14:30:00.000Z",
    verdict: "SAFE",
    findings: [],
    payeeBlocked: false,
  },
];

export const mockDisputes: Dispute[] = [
  {
    id: "PP-D-27803",
    orderId: "7XN04512RT228330K",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status: "WAITING_FOR_SELLER_RESPONSE",
    amount: eur(5490),
    sellerResponseDue: "2026-11-15T23:59:59.000Z",
    evidence: [
      {
        id: "ev_order",
        kind: "ORDER",
        source: "paypal_order",
        summary: "Home shirt (size M), €54.90, paid 21 Oct 2026",
        collectedAt: at(3600),
        data: { orderId: "7XN04512RT228330K", item: "Home shirt M", amount: "54.90" },
      },
      {
        id: "ev_tracking",
        kind: "TRACKING",
        source: "shipping",
        summary: "PostNL 3SXYZ0123456789 delivered 24 Oct 2026 14:12",
        collectedAt: at(3601),
        data: { carrier: "POSTNL", trackingNumber: "3SXYZ0123456789", deliveredAt: "2026-10-24T14:12:00Z" },
      },
      {
        id: "ev_address",
        kind: "ADDRESS",
        source: "paypal_order",
        summary: "Delivered to the PayPal shipping address on the order",
        collectedAt: at(3602),
        data: { matchesOrderAddress: true },
      },
    ],
    dossier: {
      disputeId: "PP-D-27803",
      version: 1,
      strength: "STRONG",
      missingEvidence: [],
      sections: [
        {
          heading: "Order",
          body: "The buyer ordered one home shirt (size M) for €54.90 on 21 October 2026.",
          evidenceIds: ["ev_order"],
        },
        {
          heading: "Delivery",
          body: "PostNL shows delivery on 24 October 2026 at 14:12 to the shipping address on the PayPal order.",
          evidenceIds: ["ev_tracking", "ev_address"],
        },
      ],
      status: "DRAFT",
      approvedAt: null,
      submittedAt: null,
    },
  },
];

let seq = 0;
const audit = (e: Omit<AuditEvent, "seq" | "hash">): AuditEvent => {
  seq += 1;
  return { seq, hash: `mock${String(seq).padStart(60, "0")}`, ...e };
};

export const mockAudit: AuditEvent[] = [
  audit({ at: at(11), pillar: "purchasing", actor: "engine", action: "policy.decision", entity: "run", entityId: "run_scene1", outcome: "ALLOW", summary: "10/10 rules passed", data: { failedRules: [] } }),
  audit({ at: at(13), pillar: "purchasing", actor: "paypal", action: "payment.captured", entity: "payment", entityId: "5O190127TN364715T", outcome: "CAPTURED", summary: "€89.00 captured, webhook verified", data: {} }),
  audit({ at: at(75), pillar: "purchasing", actor: "engine", action: "policy.decision", entity: "run", entityId: "run_scene2", outcome: "BLOCK", summary: `Blocked: ${["R1", "R4", "R5", "R6"].join(", ")}`, data: { failedRules: ["R1", "R4", "R5", "R6"], labels: [RULE_LABELS.R1, RULE_LABELS.R5] } }),
  audit({ at: at(77), pillar: "purchasing", actor: "paypal", action: "payment.voided", entity: "payment", entityId: "8RU61172JS455403V", outcome: "VOIDED", summary: "€389.00 authorization voided, never captured", data: {} }),
  audit({ at: at(3600), pillar: "disputes", actor: "paypal", action: "dispute.created", entity: "dispute", entityId: "PP-D-27803", outcome: null, summary: "Item not received, €54.90", data: {} }),
  audit({ at: at(3605), pillar: "disputes", actor: "agent", action: "dossier.drafted", entity: "dispute", entityId: "PP-D-27803", outcome: "STRONG", summary: "Dossier v1 drafted from 3 evidence items", data: {} }),
  audit({ at: at(7200), pillar: "invoices", actor: "engine", action: "invoice.verdict", entity: "invoice", entityId: "inv_scam_1", outcome: "SCAM", summary: "4 signals: brand impersonation, phone number, urgency, call to cancel", data: {} }),
];
