// Unified product shape returned by both demo shops and the Channel3 adapter.
// Listing claims (sellerCountry, rating, advertisedShipping) are untrusted hints for the agent;
// the policy engine verifies seller facts against the registry and totals against the PayPal order.

import { z } from "zod";
import { Money } from "./money";
import { Category } from "./policy";
import { ProductSource } from "./purchasing";

export const CatalogProduct = z.object({
  id: z.string(),
  shopId: z.string(),
  source: ProductSource,
  name: z.string(),
  category: Category,
  price: Money,
  advertisedShipping: Money,
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().min(0).optional(),
  sellerName: z.string(),
  sellerCountry: z.string().optional(),
  url: z.string().optional(),
  description: z.string(),
});
export type CatalogProduct = z.infer<typeof CatalogProduct>;
