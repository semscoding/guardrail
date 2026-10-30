# 06 Monitoring (onderdeel van backend/)

Terug naar [[00 Overzicht]] · Onderdeel van [[02 Backend|backend]] (workspace `backend/`, geen eigen map) · Raakt: alle lagen

Twee soorten monitoring: **operationeel** (draait het, gaat er iets mis?) en **gedrag** (doet de agent wat hij moet doen, en houdt de guardrail stand?). Het auditlog is géén monitoring maar productfunctionaliteit; het staat in [[03 Database]] en [[05 Services]].

## Plan
**Doel:** op elk moment kunnen zeggen of de demo werkt, en bij een fout binnen een minuut zien waar en waarom.

**Requirements**
- Gestructureerde JSON-logs met `requestId`/`runId` door alle lagen heen.
- `GET /api/health` dat database en upstreams controleert.
- Alerts (ntfy) op: webhook met ongeldige handtekening, capture zonder `ALLOW`, upstream-fouten in een reeks, dispute-deadline < 48 uur.
- Agent-evaluatie: een vaste scenarioset die herhaald kan draaien met een score.
- Kosten per run zichtbaar (tokens).

**Acceptatiecriteria**
- Eén `runId` geeft in de logs het volledige verhaal: agent-stappen, PayPal-calls (met `debug_id`), beslissing, webhook.
- `npm run eval` draait scène 1 en 2 tien keer en rapporteert: correcte uitkomst 10/10, gemiddelde duur, tokens.
- Geen secrets, volledige kaartgegevens of ruwe factuurtekst in logs.

**Buiten scope:** Datadog/Grafana, tracing-backend, uptime-SaaS.

## Design
**Logger** (`backend/src/logger.ts`, geen dependency): `log.info(event, fields)` → één JSON-regel naar stdout (Render toont en bewaart die). Velden altijd: `ts`, `level`, `event`, `requestId`, `runId?`, `service?`, `durationMs?`. Redactie-lijst: `authorization`, `client_secret`, `access_token`, `email` (gemaskeerd), `raw_text`.

**Wat loggen**
| Event | Velden |
|---|---|
| `http.request` | method, path, status, durationMs |
| `upstream.call` | service, endpoint, status, durationMs, `debugId` (PayPal), retry |
| `agent.step` | runId, tool, durationMs, tokens in/out |
| `policy.decision` | runId, outcome, failedRules[] |
| `payment.transition` | orderId, van → naar status |
| `webhook.received` | eventType, verified, duplicate |
| `invoice.verdict` | invoiceId, verdict, signals[] |
| `dispute.submitted` | disputeId, evidenceCount |

**Health** (`/api/health`, logica in `backend/src/health.ts`): `{ db: ok|fail, paypal: ok|fail (token ophalen), anthropic: ok|skip, channel3: ok|fail, version: <git sha> }`. Render gebruikt dit als health check; de UI toont een klein statuspuntje in de header (handig tijdens opnames).

**Invarianten (guardrail-bewaking)** — controleert `backend/src/monitoring/invariants.ts` (cron: `backend/scripts/jobs/invariants.ts`) na elke run en elk uur:
- Elke `CAPTURED` payment heeft een `ALLOW`-beslissing of een goedkeuring in het auditlog.
- Geen open authorisatie ouder dan de policy-termijn.
- Hashketen klopt (`audit:verify`).
- Elke `SUBMITTED` dossier heeft een `APPROVED`-auditregel.
Schending → ntfy-alert met hoge prioriteit + log `invariant.violated`.

**Alerts:** ntfy.sh (al gekozen voor goedkeuring op de telefoon), topic via `NTFY_TOPIC`. Prioriteiten: invariant = urgent, ongeldige webhook = hoog, upstream-reeks (≥3 fouten in 5 min) = normaal, dispute-deadline = normaal.

**Agent-evaluatie** (`npm run eval`)
- Scenario's: scène 1 (verwacht ALLOW), scène 2 (verwacht BLOCK op R1 + R5), boven goedkeuringsgrens (NEEDS_APPROVAL), scamfactuur (SCAM), legitieme factuur (SAFE), INR-dispute met tracking (sterk dossier), zonder tracking (zwak).
- Meet: juiste uitkomst, aantal tool-calls, duur, tokens, of de agent in de injectie trapte (informatief, geen fout).
- Output: tabel in de terminal + JSON in `eval-results/` (gitignored).

## Structure
Valt onder workspace `backend/` (`@guardrail/backend`), zie [[02 Backend#Monitoring valt onder backend/|backend]].
```
backend/src/logger.ts
backend/src/health.ts                       health-checks
backend/src/monitoring/alerts/ntfy.ts
backend/src/monitoring/invariants.ts
backend/scripts/jobs/invariants.ts          cron: draait de invarianten
backend/scripts/eval/run.ts  scenarios.ts   npm run eval (vanuit de repo-root)
frontend/src/app/api/health/route.ts        dunne route handler
```
**Conventies:** event-namen `domein.actie` in kleine letters; nooit `console.log` direct (lint-regel `no-console` behalve in `backend/src/logger.ts` en `backend/scripts/`); elke catch logt met `error.code` en `upstream.debugId` als die er is.

## Scale
**Voor de demo**
- 8-11: `npm run eval` 10× groen is de definitie van "demo klaar".
- Tijdens opnames: health-indicator groen, ntfy op de telefoon aan (laat in de video zien dat een blokkade direct een melding geeft).

**Na de hackathon**
- OpenTelemetry-traces (agent → engine → PayPal) naar een backend zoals Honeycomb of Grafana Cloud.
- Error tracking (Sentry) met release-tracking.
- Dashboards: blokkadepercentage per regel, kosten per run, p95-latentie PayPal, dispute-winrate.
- Eval in CI bij elke wijziging aan prompts of modellen; prompt-versies vergelijken.
- Uptime-monitoring en on-call-alerts zodra er betalende klanten zijn.
