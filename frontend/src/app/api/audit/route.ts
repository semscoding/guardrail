import { AuditQuery } from "@guardrail/apis/contracts";
import { route } from "@guardrail/backend";
import { queryAudit } from "@guardrail/services/audit";

export const GET = route({ auth: "demo", query: AuditQuery }, ({ query }) => queryAudit(query));
