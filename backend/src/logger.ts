// One JSON line per event on stdout (Render keeps them). Secrets are redacted before writing.

import type { LogFields, Logger } from "@guardrail/apis/domain";

const SECRET_KEYS = /^(authorization|client_secret|access_token|password|token|api_key|apikey|x-admin-token)$/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (typeof value === "string") return value.replace(EMAIL, "$1***$2");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

export function createLogger(base: LogFields = {}): Logger {
  const write = (level: "info" | "warn" | "error", event: string, fields: LogFields = {}) => {
    const line = JSON.stringify(redact({ ts: new Date().toISOString(), level, event, ...base, ...fields }));
    if (level === "error") console.error(line);
    else console.log(line);
  };
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const log = createLogger();
