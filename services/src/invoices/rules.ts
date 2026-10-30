// Layer 1 of Invoice Shield: deterministic rules. Every finding carries the exact character span of
// the text it was found in (excerpt === text.slice(start, end)), so the UI can mark it in place.

import type { Finding, SignalKind } from "@guardrail/apis/domain";

import { sellerByPayee } from "../catalog/registry";

type Pattern = { re: RegExp; explanation: string };

const ruleFinding = (kind: SignalKind, text: string, start: number, end: number, explanation: string): Finding => ({
  kind,
  span: { start, end },
  excerpt: text.slice(start, end),
  explanation,
  detectedBy: "rule",
});

/** All matches of a global regex as findings. `group` narrows the span to one capture group. */
function matchAll(text: string, kind: SignalKind, { re, explanation }: Pattern): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || !m[0]) continue;
    out.push(ruleFinding(kind, text, m.index, m.index + m[0].length, explanation));
  }
  return out;
}

// Phone numbers: optional +country code and (area code), then digit groups separated by space, dot or
// dash. A candidate needs 9 to 15 digits, so invoice numbers and dates ("2026-0412") do not match.
const PHONE_RE = /(?<![\w+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{1,4}(?:[\s.-]\d{2,4}){1,4}(?!\w)/g;

function phoneNumbers(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    if (m.index === undefined) continue;
    const digits = m[0].replace(/\D/g, "").length;
    if (digits < 9 || digits > 15) continue;
    out.push(ruleFinding("PHONE_NUMBER", text, m.index, m.index + m[0].length, "Phone number in the invoice, asking you to call"));
  }
  return out;
}

// Brands scammers impersonate in fake renewal and refund invoices. "PayPal" itself is not a signal
// (a real invoice mentions it); lookalike spellings and fake PayPal departments are.
const BRANDS: Pattern[] = [
  { re: /\bGeek\s?Squad\b/gi, explanation: "Geek Squad name used by a payee that is not a registered seller" },
  { re: /\bBest\s?Buy\b/gi, explanation: "Best Buy name used by a payee that is not a registered seller" },
  { re: /\bMcAfee\b/gi, explanation: "McAfee name used by a payee that is not a registered seller" },
  { re: /\bNorton(?:\s?LifeLock)?\b/gi, explanation: "Norton name used by a payee that is not a registered seller" },
  { re: /\b(?:Microsoft|Windows Defender)\b/gi, explanation: "Microsoft name used by a payee that is not a registered seller" },
  { re: /\b(?:Apple(?: Care| Support)?|iCloud)\b/gi, explanation: "Apple name used by a payee that is not a registered seller" },
  { re: /\b(?:Coinbase|Binance)\b/gi, explanation: "Crypto exchange name used by a payee that is not a registered seller" },
  { re: /\bAmazon(?: Prime)?\b/gi, explanation: "Amazon name used by a payee that is not a registered seller" },
  {
    re: /\b(?:Pay[\s-]Pal|PayPai|PaypaI|Paypa1|PayPal[\s-]?(?:Billing|Security|Support|Team|Resolution)(?:\s(?:Center|Centre|Dept\.?|Department))?)\b/g,
    explanation: "PayPal lookalike or fake PayPal department",
  },
];

const URGENCY: Pattern = {
  re: /\b(?:within \d{1,3} (?:hours?|hrs?|minutes?|days?)|immediately|right away|final notice|last (?:notice|chance|warning)|urgent(?:ly)?|act now|today only|as soon as possible|before (?:it is|it's) too late|(?:account|service|subscription) will be (?:suspended|closed|terminated|locked))\b/gi,
  explanation: "Time pressure, so you act before you check",
};

const CRYPTO: Pattern[] = [
  { re: /\b(?:bitcoin|btc|usdt|tether|ethereum|cryptocurrency|crypto wallet|wallet address|gift cards?)\b/gi, explanation: "Asks for payment in crypto or gift cards, which cannot be reversed" },
  { re: /\b(?:bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})\b/g, explanation: "Crypto wallet address" },
];

// Moves you off PayPal: these phrases are signals on their own.
const OFF_PAYPAL: Pattern[] = [
  { re: /\bdo(?: not|n't) pay (?:through|via|with|on|using) PayPal\b/gi, explanation: "Tells you not to pay through PayPal, so you lose PayPal's protection" },
  { re: /\b(?:our|an|the) (?:agent|representative|technician|support team) will (?:process|issue|handle|complete) [^.\n;]{0,40}?\b(?:by|over the) phone\b/gi, explanation: "Refund handled by phone: the classic refund-scam move" },
  { re: /\b(?:refund|cancel(?:lation)?)[^.\n;]{0,40}?\bby (?:phone|calling)\b/gi, explanation: "Refund or cancellation only by phone" },
];

// "Call us" only counts when the same sentence is about cancelling, refunding or disputing a charge.
const CALL_RE = /\b(?:call|phone|ring|contact) (?:us|our [a-z]+(?: [a-z]+)?|this number|(?:the )?(?:number|helpline|hotline) (?:below|above))\b/gi;
const CANCEL_CONTEXT = /\b(?:cancel|refund|dispute|did not authori[sz]e|didn't authori[sz]e|unauthori[sz]ed|not authori[sz]ed)/i;

function callToCancel(text: string): Finding[] {
  const out = OFF_PAYPAL.flatMap((p) => matchAll(text, "CALL_TO_CANCEL", p));
  // Sentences: split on . ; and newlines, keeping offsets.
  for (const s of text.matchAll(/[^.;\n]+/g)) {
    if (s.index === undefined || !CANCEL_CONTEXT.test(s[0])) continue;
    for (const m of s[0].matchAll(CALL_RE)) {
      if (m.index === undefined) continue;
      const start = s.index + m.index;
      out.push(ruleFinding("CALL_TO_CANCEL", text, start, start + m[0].length, "Asks you to call to cancel or get a refund"));
    }
  }
  return out;
}

function unknownPayee(text: string, payeeEmail: string | null): Finding[] {
  if (!payeeEmail || sellerByPayee(payeeEmail)) return [];
  const at = text.toLowerCase().indexOf(payeeEmail.toLowerCase());
  // The payee may come from the invoice metadata instead of the text: then the finding has an empty
  // span at 0 (excerpt "") and the UI lists it without marking text.
  const [start, end] = at >= 0 ? [at, at + payeeEmail.length] : [0, 0];
  return [ruleFinding("UNKNOWN_PAYEE", text, start, end, `${payeeEmail} is not a seller in GUARDRAIL's registry`)];
}

/** Runs every rule. Overlapping findings are kept; sorted by position. */
export function runRules(text: string, payeeEmail: string | null): Finding[] {
  const registered = payeeEmail ? Boolean(sellerByPayee(payeeEmail)) : false;
  const findings = [
    ...phoneNumbers(text),
    ...(registered ? [] : BRANDS.flatMap((p) => matchAll(text, "BRAND_IMPERSONATION", p))),
    ...matchAll(text, "URGENCY", URGENCY),
    ...callToCancel(text),
    ...CRYPTO.flatMap((p) => matchAll(text, "CRYPTO", p)),
    ...unknownPayee(text, payeeEmail),
  ];
  return dedupe(findings).sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
}

/** Drops exact duplicates (same kind and span) and findings contained in another of the same kind. */
export function dedupe(findings: Finding[]): Finding[] {
  return findings.filter((f, i) =>
    !findings.some((g, j) => {
      if (j === i || g.kind !== f.kind) return false;
      const contains = g.span.start <= f.span.start && g.span.end >= f.span.end;
      const same = g.span.start === f.span.start && g.span.end === f.span.end;
      return same ? j < i : contains;
    }),
  );
}
