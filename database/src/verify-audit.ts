// CLI entrypoint for `npm run audit:verify`: checks the entire audit_events hash chain.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb } from "./client";
import { verifyAuditChain } from "./repositories/audit";

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  verifyAuditChain()
    .then((res) => {
      if (res.ok) {
        console.log(`ok    audit chain verified (${res.checked} event(s), head ${res.headHash.slice(0, 12)}…)`);
      } else {
        console.error(`FAIL  audit chain broken at seq ${res.brokenAtSeq}: ${res.reason}`);
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("FAIL  audit:verify", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
