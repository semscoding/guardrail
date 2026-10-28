// Points a PayPal sandbox webhook at <public-base-url>/api/paypal/webhook and stores its id in .env.local.
// Old webhooks on temporary tunnel hosts are removed first (sandbox apps allow only a handful).
//
// Run: npm run webhook:register -- https://<something>.trycloudflare.com

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { call } from "../src/lib/paypal";
import { WEBHOOK_EVENT_TYPES } from "../src/lib/payments";

type Webhook = { id: string; url: string };

function setEnvValue(file: string, key: string, value: string) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(file, lines.join("\n"));
}

async function main() {
  const base = process.argv[2]?.replace(/\/$/, "");
  if (!base?.startsWith("https://")) throw new Error("Usage: npm run webhook:register -- https://<public-host>");
  const url = `${base}/api/paypal/webhook`;

  const { webhooks } = await call<{ webhooks: Webhook[] }>("GET", "/v1/notifications/webhooks");
  for (const hook of webhooks) {
    if (hook.url === url || new URL(hook.url).hostname.endsWith(".trycloudflare.com")) {
      await call("DELETE", `/v1/notifications/webhooks/${hook.id}`);
      console.log(`Removed old webhook ${hook.id} (${hook.url})`);
    }
  }

  const created = await call<Webhook>("POST", "/v1/notifications/webhooks", {
    url,
    event_types: WEBHOOK_EVENT_TYPES.map((name) => ({ name })),
  });
  setEnvValue(".env.local", "PAYPAL_WEBHOOK_ID", created.id);
  console.log(`Webhook ${created.id} → ${url}\nSaved PAYPAL_WEBHOOK_ID to .env.local. Restart the dev server to pick it up.`);
}

main().catch((err) => {
  console.error("✖", err.details ?? err);
  process.exitCode = 1;
});
