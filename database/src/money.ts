// Exact integer-cents <-> PostgreSQL numeric(10,2) string conversion. Never uses IEEE-754 floats.

import { Money } from "@guardrail/apis/domain";

export function moneyToNumeric(money: Money): { amount: string; currency: string } {
  const parsed = Money.parse(money);
  const negative = parsed.cents < 0;
  const abs = Math.abs(parsed.cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return {
    amount: `${negative ? "-" : ""}${whole}.${frac}`,
    currency: parsed.currency,
  };
}

const NUMERIC_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export function numericToMoney(amount: string, currency: string): Money {
  const trimmed = amount.trim();
  const match = NUMERIC_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid numeric(10,2) money value: "${amount}"`);
  }
  const [, sign, wholeStr, fracStr = ""] = match;
  const whole = Number.parseInt(wholeStr, 10);
  const frac = Number.parseInt(fracStr.padEnd(2, "0"), 10);
  const total = whole * 100 + frac;
  const cents = sign === "-" ? -total : total;
  return Money.parse({ cents, currency: currency.trim() });
}
