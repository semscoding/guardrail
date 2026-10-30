// Offline test mode: a deterministic, deliberately naive planner used when no AI key is configured.
// It behaves like a gullible agent: it searches, reads the cheapest matching product page and
// proposes that offer, taking the shop's own claims (country, rating, price) at face value.
// It is never presented as AI: the run's first step says it is offline test mode.

import type { ToolRunner } from "@guardrail/apis/llm";
import { eur } from "@guardrail/apis/domain";

import { SHOPS } from "../catalog/shops";
import type { ProposeInput, SearchHit } from "./agent";

const STOPWORDS = new Set([
  "a", "an", "the", "our", "my", "we", "us", "for", "of", "to", "and", "or", "with", "from", "please",
  "buy", "get", "order", "purchase", "restock", "need", "some", "new", "under", "below", "max", "at", "most",
  "less", "than", "up", "in", "on", "club", "team",
]);

/** Search terms from a free-text command: lowercase words minus filler and prices. */
export function extractKeywords(command: string): string[] {
  const words = command
    .toLowerCase()
    .replace(/[€$]\s*\d+(?:[.,]\d+)?/g, " ")
    .split(/[^a-z0-9-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/** "under €100" / "max 100 euro" → 10000 cents. */
export function extractBudgetCents(command: string): number | null {
  const m = /(?:under|below|max(?:imum)?|less than|up to|at most)\s*(?:€|eur|euro)?\s*(\d+(?:[.,]\d{1,2})?)/i.exec(command);
  if (!m) return null;
  return Math.round(Number(m[1].replace(",", ".")) * 100);
}

/** A shop the command names explicitly ("from Nordic Gear"). */
function namedShopId(command: string): string | null {
  const lower = command.toLowerCase();
  return SHOPS.find((s) => lower.includes(s.name.toLowerCase()) || lower.includes(s.id))?.id ?? null;
}

const haystack = (h: SearchHit) => `${h.name} ${h.category} ${h.sellerName}`.toLowerCase();

const score = (h: SearchHit, keywords: string[]) => keywords.filter((k) => haystack(h).includes(k)).length;

/** Most matching keywords first, then the cheapest. Exported for tests. */
export function rankHits(hits: SearchHit[], command: string): SearchHit[] {
  const keywords = extractKeywords(command);
  const budget = extractBudgetCents(command);
  const shopId = namedShopId(command);
  const eligible = hits.filter(
    (h) => (budget === null || h.priceCents <= budget) && (shopId === null || h.shopId === shopId),
  );
  return eligible
    .map((h) => ({ h, s: score(h, keywords) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.h.priceCents - b.h.priceCents)
    .map((x) => x.h);
}

/** Reads the shop's self-description from the page text, the way a gullible agent would. */
export function claimsFromPage(pageText: string): ProposeInput["claims"] {
  const country = /Seller location:\s*([A-Za-z]{2,})/.exec(pageText)?.[1];
  const rating = /Seller rating\s*([\d.]+)\s*\/\s*5/.exec(pageText)?.[1];
  const price = /€(\d+(?:\.\d{2})?)\s*·\s*Shipping\s*(free|€(\d+(?:\.\d{2})?))/.exec(pageText);
  const priceCents = price ? Math.round(Number(price[1]) * 100) : null;
  const shippingCents = price?.[3] ? Math.round(Number(price[3]) * 100) : 0;
  return {
    ...(country ? { sellerCountry: country } : {}),
    ...(rating ? { sellerRating: Number(rating) } : {}),
    ...(priceCents !== null ? { total: eur(priceCents + shippingCents) } : {}),
  };
}

export async function offlinePlan(command: string, run: ToolRunner): Promise<void> {
  const keywords = extractKeywords(command);
  const query = keywords.join(" ") || command;
  const { results } = (await run("search_products", { query })) as { results: SearchHit[] };

  const best = rankHits(results, command)[0];
  if (!best) return; // nothing matched: no proposal, the run fails with a clear message

  const page = (await run("get_product", { shopId: best.shopId, productId: best.productId })) as {
    pageText?: string;
  };
  const claims = page.pageText ? claimsFromPage(page.pageText) : {};
  const claimText = [
    claims.sellerCountry ? `based in ${claims.sellerCountry}` : null,
    claims.sellerRating ? `rated ${claims.sellerRating}/5` : null,
  ]
    .filter(Boolean)
    .join(", ");

  await run("propose_purchase", {
    shopId: best.shopId,
    productId: best.productId,
    quantity: 1,
    reasoning: `Cheapest matching offer at ${best.price} (shipping ${best.shipping}); the seller says it is ${claimText || "reliable"}.`,
    claims,
  });
}
