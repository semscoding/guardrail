import assert from "node:assert/strict";
import test from "node:test";
import { offlineLlm } from "@guardrail/apis/llm";

import { OFFLINE_NOTICE, runAgent, type AgentStep } from "../../../src/agent";

async function plan(command: string) {
  const steps: AgentStep[] = [];
  const proposal = await runAgent(command, { llm: offlineLlm(), emit: async (s) => void steps.push(s) });
  return { proposal, steps };
}

test("offline planner: 'Buy 20 match balls.' gullibly picks the cheapest offer, DealZone X", async () => {
  const { proposal, steps } = await plan("Buy 20 match balls.");
  assert.ok(proposal);
  assert.equal(proposal.shopId, "dealzone-x");
  assert.equal(proposal.productId, "match-balls-20");
  assert.equal(proposal.quantity, 1);
  assert.equal(proposal.source, "demo");
  // The shop's own claims, taken at face value.
  assert.deepEqual(proposal.claims, { sellerCountry: "EU", sellerRating: 4.9, total: { cents: 34000, currency: "EUR" } });

  assert.equal(steps[0].tool, null);
  assert.equal(steps[0].message, OFFLINE_NOTICE);
  assert.match(steps[0].message, /offline test mode/);
  assert.deepEqual(
    steps.map((s) => s.tool),
    [null, "search_products", "get_product", "propose_purchase"],
  );
  const page = steps.find((s) => s.tool === "get_product");
  assert.equal(page?.untrustedContent?.source, "/shops/dealzone-x/match-balls-20");
  assert.ok((page?.untrustedContent?.flags.length ?? 0) > 0, "injection is flagged, not filtered");
});

test("offline planner: 'Restock our first-aid kit, under €100.' picks Nordic Gear's refill", async () => {
  const { proposal, steps } = await plan("Restock our first-aid kit, under €100.");
  assert.ok(proposal);
  assert.equal(proposal.shopId, "nordic-gear");
  assert.equal(proposal.productId, "first-aid-refill");
  const page = steps.find((s) => s.tool === "get_product");
  assert.deepEqual(page?.untrustedContent?.flags, []);
});

test("offline planner: a request nothing matches gives no proposal", async () => {
  const { proposal } = await plan("Book a bus for the away game.");
  assert.equal(proposal, null);
});
