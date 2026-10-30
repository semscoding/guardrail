// Errors the dispute services throw on purpose. Route handlers map them to AppError codes;
// services never import @guardrail/backend.

export type DisputeErrorCode = "NOT_FOUND" | "CONFLICT" | "VALIDATION";

export class DisputeError extends Error {
  constructor(
    readonly code: DisputeErrorCode,
    message: string,
  ) {
    super(message);
  }
}
