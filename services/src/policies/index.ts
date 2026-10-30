// Read side of policies for the UI. The agent has no path to this module.

import type { PolicyVersion } from "@guardrail/apis/domain";
import { getActivePolicy } from "@guardrail/database";

/** The active version of a policy, or null. The vault ID never leaves the database layer. */
export const getPolicy = (policyId: string): Promise<PolicyVersion | null> => getActivePolicy(policyId);
