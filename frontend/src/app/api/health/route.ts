import { checkHealth, route } from "@guardrail/backend";

export const GET = route({ auth: "open" }, () => checkHealth());
