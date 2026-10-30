// The HTTP envelope and error model shared by every endpoint.
// Success: { data }. Failure: { error }. Frontend and backend both parse with these schemas.

import { z } from "zod";

export const AppErrorCode = z.enum([
  "VALIDATION",
  "NOT_FOUND",
  "POLICY_BLOCKED",
  "UPSTREAM",
  "CONFLICT",
  "UNAUTHORIZED",
  "INTERNAL",
]);
export type AppErrorCode = z.infer<typeof AppErrorCode>;

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  POLICY_BLOCKED: 422,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export const AppError = z.object({
  code: AppErrorCode,
  /** Safe to show to the user. */
  message: z.string(),
  details: z.unknown().optional(),
  upstream: z
    .object({
      service: z.enum(["paypal", "channel3", "anthropic"]),
      debugId: z.string().optional(),
      status: z.number().int().optional(),
    })
    .optional(),
});
export type AppError = z.infer<typeof AppError>;

export const responseOf = <T extends z.ZodType>(data: T) =>
  z.union([z.object({ data }), z.object({ error: AppError })]);
