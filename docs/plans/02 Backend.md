# 02 Backend

Terug naar [[00 Overzicht]] · Werkt samen met: [[03 Database]], [[04 API's]], [[05 Services]]

## Plan
**Doel:** een voorspelbare server die de services aanroept, invoer valideert, fouten netjes afhandelt en langlopende agent-runs kan streamen. De backend bevat zelf geen bedrijfslogica: dat zit in [[05 Services]].

**Requirements**
- Next.js 16 route handlers (Node-runtime, niet Edge) op Render als **web service** (lange verbindingen voor SSE zijn dan geen probleem).
- Alle invoer (HTTP, webhooks, LLM-output) door een zod-schema.
- Eén foutmodel voor alle endpoints.
- Demo-beveiliging: één demo-gebruiker; muterende admin-endpoints achter `DEMO_ADMIN_TOKEN`.
- Achtergrondwerk: dispute-deadlines controleren en webhooks idempotent verwerken.

**Acceptatiecriteria**
- `npm run typecheck`, `npm run lint` en `npm test` groen.
- Elke route handler is ≤ ~30 regels: valideren → service aanroepen → antwoord vormen.
- Geen secret komt in een response, log of clientbundle.

**Buiten scope:** eigen auth-systeem, queues (BullMQ/Redis), microservices.

## Design
**Lagen (afhankelijkheden alleen naar beneden)**
```
frontend/src/app/api/*         HTTP: parse, valideer, auth, response (via route() uit backend)
  ▼
backend/src/*                  env, logger, errors, http-wrapper, health, monitoring
  ▼
services/src/*                 bedrijfslogica per pijler (geen HTTP, geen SQL-strings)
  ▼
database/src/repositories/*    SQL, rij ↔ domeintype
  ▼
apis/src/*                     domeintypes + contracten; buitenwereld: PayPal, Channel3, Claude
```
Services krijgen hun adapters en repositories als parameters (simpele dependency injection). Daardoor zijn de policy-engine en de services testbaar zonder netwerk.

**Foutmodel**
```ts
type AppError = {
  code: "VALIDATION" | "NOT_FOUND" | "POLICY_BLOCKED" | "UPSTREAM" | "CONFLICT" | "UNAUTHORIZED" | "INTERNAL";
  message: string;          // veilig voor de gebruiker
  details?: unknown;        // bv. zod-issues
  upstream?: { service: "paypal" | "channel3" | "anthropic"; debugId?: string; status?: number };
};
```
- HTTP-mapping: VALIDATION 400, UNAUTHORIZED 401, NOT_FOUND 404, CONFLICT 409, POLICY_BLOCKED 422, UPSTREAM 502, INTERNAL 500.
- `POLICY_BLOCKED` is geen fout van het systeem maar een geldige uitkomst. In de run-flow wordt het als `decision`-event gestreamd, niet als exception.
- `AppError` (schema + type) staat in `apis/src/contracts/api.ts`, dus elke workspace kan het gebruiken zonder tegen de afhankelijkheidsrichting in te gaan. `backend/src/errors.ts` doet alleen de vertaling naar HTTP.
- De bestaande `PayPalError` wordt in de adapter (`apis/src/paypal/`) omgezet naar `AppError` met `debugId` (PayPal's `debug_id`).
- Logging in services en adapters: ze krijgen een `Logger` (interface in `apis/src/domain/`) als parameter mee; de implementatie staat in `backend/src/logger.ts`. Zo importeren lagere workspaces nooit uit `backend/`.

**Configuratie:** `backend/src/env.ts` valideert alle env-variabelen bij opstart met zod en faalt direct bij een ontbrekende key. Nieuwe variabelen: `ANTHROPIC_API_KEY`, `CHANNEL3_API_KEY`, `DEMO_ADMIN_TOKEN`, `LLM_MODEL_AGENT`, `LLM_MODEL_TRIAGE`, `NTFY_TOPIC` (optioneel).

**Streaming:** `GET /api/runs/:id/stream` geeft `text/event-stream`. De run zelf draait in de request van `POST /api/runs`, schrijft elk event naar de tabel `run_events` en publiceert het via een in-process `EventEmitter`. De stream-route speelt eerst opgeslagen events af en luistert daarna live. Zo werkt herladen en teruglezen ook (en kan de video een run opnieuw tonen).

**Achtergrondtaken (Render Cron Job)**
- `backend/scripts/jobs/sync-disputes.ts` (elke 15 min): disputes ophalen als vangnet voor gemiste webhooks, deadlines markeren.
- `backend/scripts/jobs/expire-authorizations.ts` (elk uur): authorisaties ouder dan de policy-termijn voiden.

**Concurrency:** per policy maximaal één actieve run (`SELECT ... FOR UPDATE` op de policy-rij of een advisory lock). Zo kan R2 (maandbudget) niet door twee gelijktijdige runs worden omzeild.

## Structure
npm-workspaces, één Next.js-app, één deploy op Render; zie [[00 Overzicht#Repo-indeling (besluit 30-10-2026)|repo-indeling]]. Afhankelijkheden alleen `frontend → backend → services → database → apis`.
```
frontend/src/app/api/      dunne route handlers, zie [[04 API's]] voor alle routes
backend/                   @guardrail/backend
  src/       env.ts  logger.ts  errors.ts  http.ts (route()-wrapper)  health.ts
  src/monitoring/          alerts (ntfy), invarianten, zie [[06 Monitoring]]
  scripts/   paypal-spike.ts  register-webhook.ts  jobs/ (cron-taken)  eval/
  tests/
services/                  @guardrail/services, zie [[05 Services]]
database/                  @guardrail/database, zie [[03 Database]]
apis/                      @guardrail/apis, zie [[04 API's]]
  src/paypal/    orders.ts  vault.ts  webhooks.ts  disputes.ts  invoicing.ts  client.ts
  src/channel3/  client.ts  mapper.ts
  src/llm/       client.ts  tools.ts  schemas.ts
  src/domain/    policy.ts  proposal.ts  decision.ts  invoice.ts  dispute.ts  money.ts
  src/contracts/  src/mocks/  scripts/check-contracts.ts
```
Tests staan per workspace in `<map>/tests/`.

**Nieuwe plek van de bestaande code**
- `src/lib/paypal.ts` → `apis/src/paypal/client.ts`
- `src/lib/db.ts` → `database/src/client.ts`
- `src/lib/payments.ts` → `services/src/payments/payments.ts`
- `src/lib/shops.ts` en `src/lib/registry.ts` → `services/src/catalog/`
- `scripts/paypal-spike.ts` en `scripts/register-webhook.ts` → `backend/scripts/`
- `src/domain`, `src/contracts`, `src/mocks` → `apis/src/domain`, `apis/src/contracts`, `apis/src/mocks`
- `scripts/check-contracts.ts` → `apis/scripts/check-contracts.ts`

### Monitoring valt onder backend/
Monitoring is geen eigen workspace. Logger, health, alerts (ntfy) en invarianten staan in `backend/src/` (`logger.ts`, `health.ts`, `monitoring/`); de cron-job voor invarianten en `npm run eval` staan in `backend/scripts/`. Details: [[06 Monitoring|monitoring-plan]].

**Handler-wrapper** (`backend/src/http.ts`): `route(schema, handler)` regelt parsen, auth-check, `AppError` → HTTP en logging met `requestId`. Elke route gebruikt hem.

## Scale
**Voor de demo**
- Timeouts per upstream: PayPal 10 s, Channel3 8 s, Claude 60 s (stream).
- Retries met backoff alleen op idempotente calls (GET, of mutaties met `PayPal-Request-Id`).
- `POST /api/demo/reset`: database leegmaken naar seed, open authorisaties voiden.
- Render: health check op `/api/health`, auto-deploy vanaf `main`.

**Na de hackathon**
- Echte auth (bv. Auth.js of Clerk) + tenant-ID op elke query.
- Agent-runs naar een queue/worker zodra runs langer duren of parallel moeten.
- Rate limiting per tenant; secrets in een secret manager; PayPal live-credentials per merchant via Partner/Connected Path.
- Aparte worker-service op Render voor cron + webhooks als het volume groeit.
