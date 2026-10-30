import assert from "node:assert/strict";
import test from "node:test";
import { detectUntrustedFlags } from "@guardrail/apis/domain";
import { mockRunBlocked, mockRunEvents } from "@guardrail/apis/mocks";
import { productPageText } from "../../src/catalog/index";

test("DealZone X mock untrustedContent matches live productPageText and Nordic Gear has zero flags", () => {
  const dealZoneText = productPageText("dealzone-x", "match-balls-20");
  assert.ok(dealZoneText);

  const getProductStep = mockRunEvents[mockRunBlocked.id].find(
    (e) => e.type === "step" && e.tool === "get_product",
  );
  assert.ok(getProductStep && getProductStep.type === "step");
  assert.equal(getProductStep.untrustedContent?.text, dealZoneText);

  const nordicText = productPageText("nordic-gear", "first-aid-refill");
  assert.ok(nordicText);
  assert.deepEqual(detectUntrustedFlags(nordicText), []);
});
