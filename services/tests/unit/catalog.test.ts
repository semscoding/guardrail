import assert from "node:assert/strict";
import test from "node:test";
import { CatalogProduct } from "@guardrail/apis/domain";
import {
  getCatalogProduct,
  listCatalogProducts,
  quote,
} from "../../src/catalog/index";

test("demo shops expose valid CatalogProduct items with prices in integer cents", () => {
  const products = listCatalogProducts();
  assert.equal(products.length, 8);

  for (const product of products) {
    const parsed = CatalogProduct.parse(product);
    assert.equal(parsed.source, "demo");
  }

  const cones = getCatalogProduct("nordic-gear", "training-cones-50");
  assert.ok(cones);
  assert.deepEqual(cones.price, { cents: 3900, currency: "EUR" });
  assert.deepEqual(cones.advertisedShipping, { cents: 495, currency: "EUR" });
  assert.equal(cones.sellerName, "Nordic Gear");
  assert.equal(cones.sellerCountry, "NL");

  const dealzoneBalls = getCatalogProduct("dealzone-x", "match-balls-20");
  assert.ok(dealzoneBalls);
  assert.deepEqual(dealzoneBalls.price, { cents: 34000, currency: "EUR" });
  assert.deepEqual(dealzoneBalls.advertisedShipping, { cents: 0, currency: "EUR" });
});

test("quote for dealzone-x match-balls-20 still totals 389 EUR including hidden checkout fee", () => {
  const q = quote("dealzone-x", "match-balls-20", 1);
  assert.ok(q);
  assert.equal(q.total, 389);
  assert.equal(q.currency, "EUR");
  assert.deepEqual(q.lines, [
    { label: "1 × Premium match balls size 5 (20 pcs) – BEST DEAL", amount: 340 },
    { label: "Shipping", amount: 0 },
    { label: "Handling & import", amount: 49 },
  ]);
});
