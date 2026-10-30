// Facts read from pasted invoice text: the payee (first email address) and the amount (first
// currency amount). Amounts become integer cents by string parsing, never through floats.

import type { Money } from "@guardrail/apis/domain";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function extractPayeeEmail(text: string): string | null {
  return EMAIL_RE.exec(text)?.[0].toLowerCase() ?? null;
}

const SYMBOLS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };
const NUMBER = String.raw`\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?`;
const AMOUNT_RE = new RegExp(
  String.raw`(?:(US\$|€|\$|£)\s?(${NUMBER}))|(?:\b(EUR|USD|GBP)\s?(${NUMBER}))|(?:(${NUMBER})\s?(EUR|USD|GBP|€)(?![A-Za-z]))`,
);

/** "1,299.99" / "1.299,99" / "126" → cents. A trailing separator + exactly two digits is the fraction. */
export function parseCents(raw: string): number | null {
  const s = raw.trim();
  const frac = /[.,](\d{2})$/.exec(s);
  const wholePart = frac ? s.slice(0, frac.index) : s;
  const whole = wholePart.replace(/[.,\s]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const cents = Number.parseInt(whole, 10) * 100 + (frac ? Number.parseInt(frac[1], 10) : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function extractAmount(text: string): Money | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const symbol = m[1] ?? m[3] ?? m[6];
  const number = m[2] ?? m[4] ?? m[5];
  const currency = symbol === "US$" ? "USD" : (SYMBOLS[symbol] ?? symbol);
  const cents = number ? parseCents(number) : null;
  return cents === null ? null : { cents, currency };
}
