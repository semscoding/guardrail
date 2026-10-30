// Small helpers shared by the rules. Money is compared in integer cents and only within one currency.

import { formatMoney, type Money } from "@guardrail/apis/domain";

import type { EvaluateInput } from "./types";

export const sameCurrency = (a: Money, b: Money) => a.currency === b.currency;

export const fmt = formatMoney;

export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The registry entry of the proposed shop, if GUARDRAIL ever verified it. */
export const registeredSeller = (input: EvaluateInput) =>
  input.registry.find((s) => s.shopId === input.proposedShopId);
