// The verdict. Code decides, not the LLM: SCAM needs at least one rule finding and at least two
// distinct strong signals, of which at least one found by a rule. LLM findings alone reach SUSPICIOUS at most.

import type { Finding, SignalKind, Verdict } from "@guardrail/apis/domain";

export const STRONG_SIGNALS: ReadonlySet<SignalKind> = new Set(["PHONE_NUMBER", "CALL_TO_CANCEL", "BRAND_IMPERSONATION", "CRYPTO"]);

export function decideVerdict(findings: Finding[]): Verdict {
  const rule = findings.filter((f) => f.detectedBy === "rule");
  const strongKinds = new Set(findings.filter((f) => STRONG_SIGNALS.has(f.kind)).map((f) => f.kind));
  const strongRule = rule.some((f) => STRONG_SIGNALS.has(f.kind));
  if (rule.length >= 1 && strongRule && strongKinds.size >= 2) return "SCAM";
  if (findings.length > 0) return "SUSPICIOUS";
  return "SAFE";
}
