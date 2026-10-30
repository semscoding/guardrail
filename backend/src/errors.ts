// One error model for every endpoint. Services throw AppErrorException; anything else becomes INTERNAL
// without leaking its message or stack to the client.

import { AppError, HTTP_STATUS, type AppErrorCode } from "@guardrail/apis/contracts";
import { PayPalError } from "@guardrail/apis/paypal";

export class AppErrorException extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
  }
}

export const appError = (code: AppErrorCode, message: string, details?: unknown) =>
  new AppErrorException({ code, message, details });

function paypalDebugId(details: unknown): string | undefined {
  if (details && typeof details === "object" && "debug_id" in details) {
    const id = (details as { debug_id?: unknown }).debug_id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppErrorException) return err.appError;
  if (err instanceof PayPalError) {
    return {
      code: "UPSTREAM",
      message: "PayPal did not accept the request.",
      upstream: { service: "paypal", status: err.status, debugId: paypalDebugId(err.details) },
    };
  }
  return { code: "INTERNAL", message: "Something went wrong on the server." };
}

export const statusOf = (error: AppError) => HTTP_STATUS[error.code];
