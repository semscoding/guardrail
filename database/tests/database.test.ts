import assert from "node:assert/strict";
import test from "node:test";
import { mockPolicy } from "@guardrail/apis/mocks";
import {
  createDbClient,
  getActivePolicy,
  migrate,
  moneyToNumeric,
  numericToMoney,
  recordAuditEvent,
  resetDatabase,
  seed,
  verifyAuditChain,
} from "../src/index";

test("resetDatabase runs twice cleanly, migrate + seed are idempotent, and Club Supplies policy is loaded", async () => {
  const client = await createDbClient({ pgliteDir: "memory://" });
  try {
    const first = await resetDatabase({ client });
    assert.equal(first.migrations.applied.length, 5);

    const second = await resetDatabase({ client });
    assert.equal(second.migrations.applied.length, 5);

    const noopMigrate = await migrate(client);
    assert.equal(noopMigrate.applied.length, 0);
    assert.equal(noopMigrate.skipped.length, 5);

    const noopSeed = await seed(client);
    assert.equal(noopSeed.policyInserted, false);
    assert.equal(noopSeed.disputeInserted, false);

    const policy = await getActivePolicy("pol_club_supplies", client);
    assert.deepEqual(policy, mockPolicy);

    const verified = await verifyAuditChain(client);
    assert.equal(verified.ok, true);
    assert.equal(verified.checked, 2);
  } finally {
    await client.close();
  }
});

test("audit_events rejects UPDATE and DELETE via trigger, and verifyAuditChain catches tampered rows", async () => {
  const client = await createDbClient({ pgliteDir: "memory://" });
  try {
    await resetDatabase({ client });

    await recordAuditEvent(
      {
        pillar: "purchasing",
        actor: "engine",
        action: "policy.decision",
        entity: "run",
        entityId: "run_test_1",
        outcome: "ALLOW",
        summary: "10/10 rules passed",
        data: { zKey: 1, aKey: [true, { nested: "ok" }] },
      },
      client,
    );

    await assert.rejects(
      () => client.query("UPDATE audit_events SET summary = 'forged' WHERE seq = 1"),
      /audit_events is append-only: UPDATE is not allowed/,
    );

    await assert.rejects(
      () => client.query("DELETE FROM audit_events WHERE seq = 1"),
      /audit_events is append-only: DELETE is not allowed/,
    );

    const intact = await verifyAuditChain(client);
    assert.equal(intact.ok, true);
    assert.equal(intact.checked, 3);

    // Simulate privileged DB tampering by temporarily disabling the trigger, then re-enabling it.
    await client.exec("ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_immutable;");
    await client.query("UPDATE audit_events SET summary = 'tampered behind the scenes' WHERE seq = 2");
    await client.exec("ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_immutable;");

    const tampered = await verifyAuditChain(client);
    assert.equal(tampered.ok, false);
    if (!tampered.ok) {
      assert.equal(tampered.brokenAtSeq, 2);
      assert.match(tampered.reason, /Hash mismatch at seq 2/);
    }
  } finally {
    await client.close();
  }
});

test("moneyToNumeric and numericToMoney convert integer cents without floating-point drift", () => {
  for (const cents of [0, 1, 99, 1999, 35000, 35001, 100000]) {
    const { amount, currency } = moneyToNumeric({ cents, currency: "EUR" });
    const roundTripped = numericToMoney(amount, currency);
    assert.deepEqual(roundTripped, { cents, currency: "EUR" });
  }
  assert.deepEqual(moneyToNumeric({ cents: 35001, currency: "EUR" }), {
    amount: "350.01",
    currency: "EUR",
  });
});
