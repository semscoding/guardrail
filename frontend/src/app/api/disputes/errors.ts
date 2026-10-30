// Maps the dispute services' deliberate errors to the shared AppError model. Not a route.

import { appError } from "@guardrail/backend";
import { DisputeError } from "@guardrail/services/disputes";

export async function disputeCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DisputeError) throw appError(err.code, err.message);
    throw err;
  }
}
