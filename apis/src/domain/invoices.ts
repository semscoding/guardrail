// Pillar 2: Invoice Shield. Rules find signals deterministically; the LLM may add signals,
// but a SCAM verdict always needs at least one rule signal.

import { z } from "zod";
import { Money } from "./money";

export const InvoiceSource = z.enum(["PASTE", "UPLOAD", "PAYPAL_SANDBOX"]);

export const Verdict = z.enum(["SAFE", "SUSPICIOUS", "SCAM"]);
export type Verdict = z.infer<typeof Verdict>;

export const SignalKind = z.enum([
  "PHONE_NUMBER",
  "BRAND_IMPERSONATION",
  "URGENCY",
  "CALL_TO_CANCEL",
  "UNKNOWN_PAYEE",
  "CRYPTO",
  "AMOUNT_PATTERN",
  "OTHER",
]);
export type SignalKind = z.infer<typeof SignalKind>;

export const Finding = z.object({
  kind: SignalKind,
  /** Character offsets into InboundInvoice.text; the excerpt must match exactly. */
  span: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }),
  excerpt: z.string(),
  explanation: z.string(),
  detectedBy: z.enum(["rule", "llm"]),
});
export type Finding = z.infer<typeof Finding>;

export const InboundInvoice = z.object({
  id: z.string(),
  source: InvoiceSource,
  paypalInvoiceId: z.string().nullable(),
  payeeEmail: z.string().nullable(),
  amount: Money.nullable(),
  text: z.string(),
  receivedAt: z.iso.datetime(),
  verdict: Verdict,
  findings: z.array(Finding),
  payeeBlocked: z.boolean(),
});
export type InboundInvoice = z.infer<typeof InboundInvoice>;
