// Safety net for missed webhooks: polls PayPal for disputes and upserts them into the queue.
// Run: npm run disputes:sync

import { getDispute, listDisputes } from "@guardrail/apis/paypal/disputes";
import { closeDb } from "@guardrail/database";
import { syncDisputes } from "@guardrail/services/disputes";

async function main() {
  const result = await syncDisputes({ listDisputes: () => listDisputes({ pageSize: 50 }), getDispute });
  console.log(`ok    disputes:sync seen ${result.seen}, created ${result.created}, updated ${result.updated}`);
}

main()
  .catch((err) => {
    // PayPal errors carry a body with debug_id, never credentials.
    console.error("FAIL  disputes:sync", err?.details ?? err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
