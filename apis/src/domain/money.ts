// Money is integer cents plus an ISO currency, everywhere in code. Never floats.
// The database stores numeric(10,2); conversion happens only in the repository layer.

import { z } from "zod";

export const Currency = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code, e.g. EUR");

export const Money = z.object({
  cents: z.number().int(),
  currency: Currency,
});
export type Money = z.infer<typeof Money>;

export const eur = (cents: number): Money => ({ cents, currency: "EUR" });

/** "€389.00" style, for UI and check explanations. */
export const formatMoney = (m: Money) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: m.currency }).format(m.cents / 100);
