// Server-sent events on GET /api/runs/:id/stream. Every event is also stored (run_events),
// so a reconnect or a later visit replays from seq 1 and then continues live.

import { z } from "zod";
import { Check, Decision, PaymentSummary, PurchaseProposal, RunStatus } from "../domain";
import { AppError } from "./api";

const base = { runId: z.string(), seq: z.number().int().positive(), at: z.iso.datetime() };

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("step"),
    /** Agent tool in use, if any: search_products, get_product, propose_purchase. */
    tool: z.string().nullable(),
    message: z.string(),
  }),
  z.object({ ...base, type: z.literal("proposal"), proposal: PurchaseProposal }),
  /** One per rule, in order, so the checklist can animate rule by rule. */
  z.object({ ...base, type: z.literal("check"), check: Check }),
  z.object({ ...base, type: z.literal("decision"), decision: Decision }),
  z.object({ ...base, type: z.literal("payment"), payment: PaymentSummary }),
  z.object({ ...base, type: z.literal("error"), error: AppError }),
  /** Last event of a run; the stream closes after it. */
  z.object({ ...base, type: z.literal("done"), status: RunStatus }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventType = RunEvent["type"];
