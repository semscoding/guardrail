// Deterministic detector for instruction-like / prompt-injection text inside untrusted web content.
// Never uses an LLM: flags are exact character spans produced by fixed patterns so the UI can highlight
// untrusted directives without relying on another model claim.

import { z } from "zod";

export const UntrustedFlag = z
  .object({
    phrase: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .refine((f) => f.end > f.start, { message: "end must be greater than start" });
export type UntrustedFlag = z.infer<typeof UntrustedFlag>;

export const UntrustedContent = z.object({
  source: z.string().min(1),
  text: z.string(),
  flags: z.array(UntrustedFlag),
});
export type UntrustedContent = z.infer<typeof UntrustedContent>;

const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  // Fake system/developer headers embedded in page text.
  /\b(?:system\s+(?:note|prompt|instruction|override|message)|developer\s+(?:note|instruction|message)|admin\s+override)\b/gi,
  // Direct address to AI / LLM / shopping assistants.
  /\b(?:ai\s+(?:shopping\s+)?assistants?|language\s+models?|shopping\s+agents?)\b/gi,
  // Imperatives to ignore/override rules, restrictions, or prior instructions.
  /\b(?:ignore|disregard|bypass|override)\s+(?:all\s+|any\s+)?(?:previous\s+|prior\s+|above\s+|earlier\s+)?(?:[a-z-]+\s+){0,3}(?:instructions?|rules?|restrictions?|policies|constraints?|guidelines?|limits?)\b/gi,
  // Self-asserted verification claims aimed at bypassing registry checks.
  /\bthis\s+(?:seller|merchant|vendor|offer)\s+(?:is|has\s+been)\s+verified\b/gi,
  // Explicit steering of agent recommendation or budget reasoning.
  /\b(?:recommend\s+this\s+(?:offer|product|item)\s+as\s+the\s+best\s+choice|guaranteed\s+under\s+budget)\b/gi,
];

/**
 * Finds sorted, non-overlapping spans of instruction-like text within untrusted content.
 */
export function detectUntrustedFlags(text: string): UntrustedFlag[] {
  const candidates: UntrustedFlag[] = [];

  for (const pattern of INSTRUCTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined || match[0].length === 0) continue;
      const start = match.index;
      const end = start + match[0].length;
      candidates.push({
        phrase: text.slice(start, end),
        start,
        end,
      });
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const merged: UntrustedFlag[] = [];
  for (const candidate of candidates) {
    const prev = merged[merged.length - 1];
    if (prev && candidate.start < prev.end) {
      continue;
    }
    merged.push(candidate);
  }

  return merged;
}

export function inspectUntrustedContent(source: string, text: string): UntrustedContent {
  return UntrustedContent.parse({
    source,
    text,
    flags: detectUntrustedFlags(text),
  });
}
