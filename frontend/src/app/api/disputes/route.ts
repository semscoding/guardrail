import { route } from "@guardrail/backend";
import { listDisputes } from "@guardrail/services/disputes";

export const GET = route({ auth: "demo" }, () => listDisputes());
