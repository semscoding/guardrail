// Parses every mock with the real contract schemas. Fails loudly if UI mocks and contracts drift apart.

import { z } from "zod";
import { AuditEvent, Dispute, InboundInvoice, PolicyVersion, Run } from "../src/domain";
import { RunEvent } from "../src/contracts";
import { mockAudit, mockDisputes, mockInvoices, mockPolicy, mockRunEvents, mockRuns } from "../src/mocks";

const cases: [string, z.ZodType, unknown][] = [
  ["policy", PolicyVersion, mockPolicy],
  ["runs", z.array(Run), mockRuns],
  ["run events", z.array(RunEvent), Object.values(mockRunEvents).flat()],
  ["invoices", z.array(InboundInvoice), mockInvoices],
  ["disputes", z.array(Dispute), mockDisputes],
  ["audit", z.array(AuditEvent), mockAudit],
];

let failed = 0;
for (const [name, schema, value] of cases) {
  const result = schema.safeParse(value);
  if (result.success) {
    console.log(`ok    ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}\n${z.prettifyError(result.error)}`);
  }
}

for (const inv of mockInvoices) {
  for (const f of inv.findings) {
    if (inv.text.slice(f.span.start, f.span.end) !== f.excerpt) {
      failed += 1;
      console.error(`FAIL  invoice ${inv.id}: span does not match excerpt "${f.excerpt}"`);
    }
  }
}

for (const event of Object.values(mockRunEvents).flat()) {
  if (event.type === "step" && event.untrustedContent) {
    const { text, flags } = event.untrustedContent;
    let prevEnd = 0;
    for (const flag of flags) {
      if (text.slice(flag.start, flag.end) !== flag.phrase) {
        failed += 1;
        console.error(
          `FAIL  run ${event.runId} seq ${event.seq}: flag span [${flag.start}, ${flag.end}) does not match phrase "${flag.phrase}"`,
        );
      }
      if (flag.start < prevEnd) {
        failed += 1;
        console.error(
          `FAIL  run ${event.runId} seq ${event.seq}: overlapping or unsorted flag "${flag.phrase}"`,
        );
      }
      prevEnd = flag.end;
    }
  }
}

process.exit(failed ? 1 : 0);
