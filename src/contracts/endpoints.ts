// Every GUARDRAIL endpoint: method, path, request and response schemas.
// Change a schema here only together with both sides (see AGENTS.md, "Ownership").

import { z } from "zod";
import {
  AuditEvent,
  Dispute,
  Dossier,
  InboundInvoice,
  Outcome,
  Pillar,
  PolicyRules,
  PolicyVersion,
  Run,
} from "@/domain";
import { responseOf } from "./api";

const Probe = z.enum(["ok", "fail", "skip"]);

export const HealthResponse = z.object({
  db: Probe,
  paypal: Probe,
  anthropic: Probe,
  channel3: Probe,
  version: z.string(),
});

export const CreatePolicyVersionRequest = z.object({
  rules: PolicyRules,
  validUntil: z.iso.datetime(),
});

export const CreateRunRequest = z.object({
  policyId: z.string(),
  command: z.string().trim().min(3).max(500),
});
export const CreateRunResponse = z.object({ runId: z.string() });

/** JSON body for pasted text. Uploads use multipart/form-data with a single `file` field. */
export const AnalyzeInvoiceRequest = z.object({ text: z.string().trim().min(1).max(20_000) });
export const BlockPayeeResponse = z.object({ payeeEmail: z.string(), blocked: z.literal(true) });

export const SubmitDossierRequest = z.object({ dossierVersion: z.number().int().positive() });

export const AuditQuery = z.object({
  pillar: Pillar.optional(),
  outcome: z.union([Outcome, z.string()]).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(500),
});

export const DemoResetResponse = z.object({ ok: z.literal(true) });

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  auth: "open" | "demo" | "admin" | "paypal-signature";
  request?: z.ZodType;
  query?: z.ZodType;
  response?: z.ZodType;
};

export const ENDPOINTS = {
  health: { method: "GET", path: "/api/health", auth: "open", response: responseOf(HealthResponse) },

  getPolicy: { method: "GET", path: "/api/policies/:id", auth: "demo", response: responseOf(PolicyVersion) },
  createPolicyVersion: {
    method: "POST",
    path: "/api/policies/:id/versions",
    auth: "demo",
    request: CreatePolicyVersionRequest,
    response: responseOf(PolicyVersion),
  },

  createRun: {
    method: "POST",
    path: "/api/runs",
    auth: "demo",
    request: CreateRunRequest,
    response: responseOf(CreateRunResponse),
  },
  getRun: { method: "GET", path: "/api/runs/:id", auth: "demo", response: responseOf(Run) },
  /** text/event-stream of RunEvent (see events.ts). */
  streamRun: { method: "GET", path: "/api/runs/:id/stream", auth: "demo" },
  approveRun: { method: "POST", path: "/api/runs/:id/approve", auth: "demo", response: responseOf(Run) },

  listInvoices: { method: "GET", path: "/api/invoices", auth: "demo", response: responseOf(z.array(InboundInvoice)) },
  analyzeInvoice: {
    method: "POST",
    path: "/api/invoices",
    auth: "demo",
    request: AnalyzeInvoiceRequest,
    response: responseOf(InboundInvoice),
  },
  blockPayee: {
    method: "POST",
    path: "/api/invoices/:id/block-payee",
    auth: "demo",
    response: responseOf(BlockPayeeResponse),
  },

  listDisputes: { method: "GET", path: "/api/disputes", auth: "demo", response: responseOf(z.array(Dispute)) },
  getDispute: { method: "GET", path: "/api/disputes/:id", auth: "demo", response: responseOf(Dispute) },
  draftDossier: { method: "POST", path: "/api/disputes/:id/dossier", auth: "demo", response: responseOf(Dossier) },
  submitDossier: {
    method: "POST",
    path: "/api/disputes/:id/submit",
    auth: "demo",
    request: SubmitDossierRequest,
    response: responseOf(Dispute),
  },

  listAudit: {
    method: "GET",
    path: "/api/audit",
    auth: "demo",
    query: AuditQuery,
    response: responseOf(z.array(AuditEvent)),
  },

  demoReset: { method: "POST", path: "/api/demo/reset", auth: "admin", response: responseOf(DemoResetResponse) },
  paypalWebhook: { method: "POST", path: "/api/paypal/webhook", auth: "paypal-signature" },
} as const satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof ENDPOINTS;
