import assert from "node:assert/strict";
import test from "node:test";
import { RuleId, eur, type Money } from "@guardrail/apis/domain";
import { mockPolicy } from "@guardrail/apis/mocks";

import type { RegisteredSeller } from "../../../src/catalog/registry";
import { evaluate, type EvaluateInput } from "../../../src/policy";

const NORDIC = "nordic-gear@business.example.com";
const SPORTDIRECT = "eu-sportdirect@business.example.com";
const DEALZONE = "dealzone-x@business.example.com";

const registry: RegisteredSeller[] = [
  { shopId: "nordic-gear", legalName: "Nordic Gear B.V.", country: "NL", eu: true, verifiedRating: 4.7, payeeEmail: NORDIC },
  { shopId: "eu-sportdirect", legalName: "EU SportDirect GmbH", country: "DE", eu: true, verifiedRating: 4.4, payeeEmail: SPORTDIRECT },
];

/** Scene 1 by default: Nordic Gear first-aid refill, €89, nothing spent yet. */
function input(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    policy: mockPolicy,
    proposedShopId: "nordic-gear",
    order: { total: eur(8900), payeeEmail: NORDIC },
    product: { category: "first-aid" },
    registry,
    monthSpent: eur(0),
    denylist: [],
    now: new Date("2026-11-02T10:00:00Z"),
    ...overrides,
  };
}

const order = (total: Money, payeeEmail: string | null = NORDIC) => ({ total, payeeEmail });
const failed = (overrides: Partial<EvaluateInput>) =>
  evaluate(input(overrides))
    .checks.filter((c) => !c.passed)
    .map((c) => c.ruleId);

test("scene 1: every rule holds, outcome ALLOW", () => {
  const d = evaluate(input());
  assert.equal(d.outcome, "ALLOW");
  assert.deepEqual(failed({}), []);
});

test("always all ten rules, in order", () => {
  assert.deepEqual(
    evaluate(input()).checks.map((c) => c.ruleId),
    RuleId.options,
  );
});

test("scene 2: hidden fee, unregistered shop and payee → BLOCK on R1, R4, R5, R6 (and R9)", () => {
  const overrides: Partial<EvaluateInput> = {
    proposedShopId: "dealzone-x",
    order: order(eur(34000 + 4900), DEALZONE),
    product: { category: "balls" },
    monthSpent: eur(8900),
  };
  const d = evaluate(input(overrides));
  assert.equal(d.outcome, "BLOCK");
  assert.deepEqual(failed(overrides), ["R1", "R4", "R5", "R6", "R9"]);
  const r1 = d.checks[0];
  assert.equal(r1.actual, "€389.00");
  assert.equal(d.checks[1].actual, "€478.00");
  assert.equal(d.checks[5].actual, null, "no verified rating is missing evidence, not a number");
});

test("R1 boundary: €350.00 passes, €350.01 blocks", () => {
  assert.ok(!failed({ order: order(eur(35000)) }).includes("R1"));
  assert.ok(failed({ order: order(eur(35001)) }).includes("R1"));
  assert.equal(evaluate(input({ order: order(eur(35001)) })).outcome, "BLOCK");
});

test("R9 boundary: €250.00 is ALLOW, €250.01 is NEEDS_APPROVAL", () => {
  assert.equal(evaluate(input({ order: order(eur(25000)) })).outcome, "ALLOW");
  assert.equal(evaluate(input({ order: order(eur(25001)) })).outcome, "NEEDS_APPROVAL");
  assert.equal(evaluate(input({ order: order(eur(35000)) })).outcome, "NEEDS_APPROVAL");
});

test("R2: monthly budget counts what was already spent", () => {
  assert.ok(failed({ monthSpent: eur(100000 - 8900) }).length === 0);
  assert.deepEqual(failed({ monthSpent: eur(100000 - 8899) }), ["R2"]);
});

test("R3 (and R1, R9): another currency is never compared as if it were euros", () => {
  const usd = { cents: 8900, currency: "USD" };
  assert.deepEqual(failed({ order: order(usd) }), ["R1", "R2", "R3", "R9"]);
});

test("R4: registered but not approved in this policy, or outside the EU", () => {
  const notApproved = { ...mockPolicy, rules: { ...mockPolicy.rules, allowedSellerIds: ["eu-sportdirect"] } };
  assert.deepEqual(failed({ policy: notApproved }), ["R4"]);

  const uk: RegisteredSeller = { ...registry[0], country: "GB", eu: false };
  assert.deepEqual(failed({ registry: [uk, registry[1]] }), ["R4"]);
});

test("R5: the order must pay the registered account of the proposed seller", () => {
  assert.deepEqual(failed({ order: order(eur(8900), SPORTDIRECT) }), ["R5"]);
  assert.deepEqual(failed({ order: order(eur(8900), NORDIC.toUpperCase()) }), [], "email match is case-insensitive");
});

test("R5 and R10: an order without payee is missing evidence", () => {
  assert.deepEqual(failed({ order: order(eur(8900), null) }), ["R5", "R10"]);
});

test("R6: verified rating below the minimum blocks", () => {
  const low: RegisteredSeller = { ...registry[0], verifiedRating: 3.9 };
  assert.deepEqual(failed({ registry: [low, registry[1]] }), ["R6"]);
});

test("R7: disallowed or unknown category blocks", () => {
  assert.deepEqual(failed({ product: { category: "electronics" } }), ["R7"]);
  assert.deepEqual(failed({ product: { category: null } }), ["R7"]);
});

test("R8: expired policy blocks", () => {
  assert.deepEqual(failed({ now: new Date("2027-01-01T00:00:00Z") }), ["R8"]);
  assert.deepEqual(failed({ now: new Date("2026-12-31T23:59:59Z") }), []);
});

test("R10: a payee blocked by Invoice Guard is refused", () => {
  assert.deepEqual(failed({ denylist: [" Nordic-Gear@business.example.com "] }), ["R10"]);
});

test("the engine never reads the agent's claims", () => {
  // No proposal or claim field exists on the input type; this documents the guarantee.
  const keys = Object.keys(input()).sort();
  assert.deepEqual(keys, ["denylist", "monthSpent", "now", "order", "policy", "product", "proposedShopId", "registry"]);
});
