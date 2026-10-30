# Implementatieplannen GUARDRAIL: overzicht

Terug naar [[README|GUARDRAIL]] · Eerder bouwplan: [[Bouwplan (2 weken)]]

Elke laag heeft een eigen plan met vier vaste fasen. Zo bouwen we als full-stack team in plaats van op gevoel: eerst weten wat en waarom, dan hoe, dan waar het komt, en pas daarna hoe het groeit.

| Fase | Vraag | Uitkomst |
|---|---|---|
| **Plan** | Wat moet deze laag doen, voor welke pijler, en wanneer is het af? | Requirements, acceptatiecriteria, wat buiten scope valt |
| **Design** | Hoe werkt het: contracten, datamodel, flows, beslissingen? | Types/schema's, sequenties, gemaakte keuzes met reden |
| **Structure** | Waar komt het in de repo en welke conventies gelden? | Mappen, bestanden, naamgeving, volgorde van bouwen |
| **Scale** | Wat moet anders voor productie en voor meer gebruikers? | Hardening voor de demo + roadmap na de hackathon |

## De zes plannen
1. [[01 Frontend]]: dashboard, policy-kaart, live agent-stream, AG Grid-auditlog
2. [[02 Backend]]: Next.js-server, lagen, foutmodel, auth, achtergrondtaken
3. [[03 Database]]: schema, migraties, geld, idempotentie, auditketen
4. [[04 API's]]: eigen HTTP-contract + adapters voor PayPal, Channel3 en Claude
5. [[05 Services]]: Agent, Policy-engine, Payment-orchestrator, Invoice Shield, Dispute Defender
6. [[06 Monitoring]]: logs, auditspoor, health, alerts, agent-evaluatie (onderdeel van `backend/`)

## Repo-indeling (besluit 30-10-2026)
De code-repo `/Users/sem/Developer/guardrail` is opgezet als **npm-workspaces** met vijf top-level mappen, gelijk aan de lagen. Het blijft één Next.js-app en één deploy op Render. Monitoring is geen eigen map maar valt onder `backend/` (zie [[06 Monitoring|monitoring in de backend]]).

```
guardrail/
  package.json (workspaces)  package-lock.json  tsconfig.base.json  eslint.config.mjs
  frontend/.env.example + .env.local (Next.js leest env alleen uit frontend/)  AGENTS.md  docs/plans/
  frontend/   @guardrail/frontend   Next.js-app: src/app/ (pagina's + src/app/api/ dunne route handlers),
                                    src/components/, src/hooks/, public/, next.config.ts
  backend/    @guardrail/backend    server-runtime: src/env.ts, src/logger.ts, src/errors.ts,
                                    src/http.ts (route()-wrapper), src/health.ts,
                                    src/monitoring/ (alerts/ntfy, invarianten),
                                    scripts/ (paypal-spike, register-webhook, jobs/, eval/)
  database/   @guardrail/database   src/client.ts (db()), migrations/*.sql, src/migrate.ts,
                                    src/seed.ts, src/repositories/
  apis/       @guardrail/apis       src/domain/ (zod-types), src/contracts/ (eigen HTTP-contract + SSE-events),
                                    src/mocks/, src/paypal/, src/channel3/, src/llm/, scripts/check-contracts.ts
  services/   @guardrail/services   src/catalog/ (shops, registry), src/payments/, src/policy/ (rules/r01…r10),
                                    src/agent/, src/invoices/, src/disputes/, src/audit/
```

**Afhankelijkheden alleen in deze richting:** `frontend → backend → services → database → apis`.
- Client-componenten in `frontend/` importeren alleen `@guardrail/apis` (domain, contracts, mocks).
- Server-code in `frontend/` (route handlers, server components) mag `@guardrail/backend` en `@guardrail/services` gebruiken, nooit `@guardrail/database` direct.
- Tests staan per workspace in `<map>/tests/`.

Per laag staat de detailindeling in de sectie *Structure* van het plan: [[01 Frontend#Structure|frontend]], [[02 Backend#Structure|backend]], [[03 Database#Structure|database]], [[04 API's#Structure|apis]], [[05 Services#Structure|services]] en [[06 Monitoring#Structure|monitoring]].

## Scope: drie pijlers (besluit 30-10-2026)
| Pijler | Wat | Status | Minimale demo-slice |
|---|---|---|---|
| **1. Autonomous Purchasing** | Agent stelt voor, policy-engine controleert het echte PayPal-order, dan capture of void | kern; PayPal-flow en webhooks werken al | scène 1 (geslaagd) + scène 2 (geblokkeerd) |
| **3. Dispute Defender** | Dispute komt binnen → bewijs verzamelen → dossier → mens keurt goed → indienen | tweede | één sandbox-dispute met gegenereerd dossier en goedkeuring |
| **2. Invoice Guard** | Verdachte factuur herkennen, waarschuwen, ontvanger blokkeren in de policy | derde | geplakte/geüploade factuur → rood oordeel → ontvanger op denylist |

**Volgorde = prioriteit.** Pijler 2 heeft het grootste API-risico (zie hieronder), dus die komt als laatste.

### Bekende beperkingen (eerlijk benoemen in de pitch)
- **Orders v2 is de merchant-kant.** De agent betaalt aan onze eigen sandbox-business-accounts (demowinkels), niet aan de echte Channel3-verkopers. Pitch: "real product data from Channel3; checkout runs against sandbox merchants".
- **Invoicing API leest alleen facturen die jij zelf verstuurt**, voor zover bekend. Inkomende facturen ophalen als ontvanger kan niet via de API. Aanpak: zie [[05 Services#Invoice Shield (pijler 2)|Invoice Shield]]. **Eerst verifiëren in de docs** voordat er bouwtijd in gaat.
- **Dispute Defender is verkoperkant.** Persona-uitbreiding: de club verkoopt ook clubkleding via PayPal en krijgt daar geschillen op.
- Geen "juridisch sluitend": het dossier is *volledig en conform de Seller Protection-eisen samengesteld*, en een mens keurt het goed voordat het wordt ingediend.

## Doorlopende principes (gelden voor alle lagen)
1. **De AI stelt voor, code beslist.** Geen LLM-output wordt als bewijs gebruikt. Bedragen komen uit PayPal, verkopers uit het register, productdata wordt door de server zelf opgehaald.
2. **Alles wat de AI teruggeeft wordt gevalideerd** met een schema (zod) voordat het verder gaat.
3. **Geld als integer centen** in code, `numeric(10,2)` in de database, altijd met valuta.
4. **Elke beslissing krijgt een regel-ID en een bron** en komt in het append-only auditlog.
5. **Idempotent:** elke PayPal-mutatie heeft een `PayPal-Request-Id`; elke webhook wordt één keer verwerkt.
6. **Mens in de loop** voor alles wat onomkeerbaar is en niet door de policy gedekt wordt (dispute indienen, ontvanger blokkeren, bedrag boven goedkeuringsgrens).
7. **Geen nieuwe dependency zonder reden.** Toegevoegd: `zod`, `@anthropic-ai/sdk`, `ag-grid-react`, `vitest`. Geen ORM: we blijven bij de bestaande `db().query()` met losse SQL-migraties.

## Herziene planning (30-10 → 11-11)
Dag 1 t/m 3 van het oude bouwplan zijn klaar (PayPal-spike, vaulting plan A, webhooks, demowinkels).

| Datum | Doel | Laag/lagen | Klaar als… |
|---|---|---|---|
| vr 30-10 | Sandbox-accounts, migratierunner + schema v2, Channel3-adapter | DB, API's | `npm run db:migrate` werkt; Channel3 geeft producten terug in ons `Product`-type |
| za 31-10 | Agent-service (Claude tool use) + SSE-stream | Services, Backend | agent maakt een gevalideerd voorstel voor "first-aid kit under €100" |
| zo 1-11 | Policy-engine R1–R10 + unittests | Services | alle tests groen, randgevallen inbegrepen |
| ma 2-11 | **Pijler 1 end-to-end** (voorstel → order → check → capture/void) + basis-UI | alle | scène 1 en 2 werken in de browser |
| di 3-11 | Pijler 3: dispute-ingest (webhook + poll), bewijs verzamelen | API's, Services, DB | sandbox-dispute staat in de DB met gekoppeld order en tracking |
| wo 4-11 | Pijler 3: dossier genereren, goedkeuren, indienen | Services, Frontend | dossier ingediend via `provide-evidence` na klik op "goedkeuren" |
| do 5-11 | Pijler 2: ingest + Shield (regels + Claude-classificatie) | Services, API's | scamfactuur → oordeel `SCAM` met signalen en bron |
| vr 6-11 | Pijler 2 UI + AG Grid voor alle drie + **featurefreeze** | Frontend | alle drie zichtbaar in het dashboard |
| za 7-11 | Design polish + toegankelijkheidscheck | Frontend | accesslint zonder blokkerende fouten |
| zo 8-11 | Deploy Render, reset-demo, hardening: demo 10× draaien | Backend, Monitoring | 10/10 runs gelijk; health groen |
| ma 9-11 | Video opnemen (draaiboek aanpassen naar 3 pijlers) | — | ruwe opnames |
| di 10-11 | Video monteren | — | video ≤ 3:00 |
| wo 11-11 | Devpost + **indienen** | — | status "submitted" |

## Parallel werken: Claude + Antigravity
Twee agents tegelijk levert alleen tijd op als ze **nooit dezelfde bestanden aanraken** en tegen **vaste contracten** bouwen.

**Stap 0 (eerst, samen, ~2 uur):** `apis/src/domain/*` (types) en `apis/src/contracts/*` (zod-schema's van alle endpoints en SSE-events) vastleggen en committen op `main`. Daarna verandert een contract alleen in overleg; de andere track krijgt dan een korte melding.

> **Rollen gewisseld op 30-10:** Track A (core) is nu **Antigravity**, Track B (frontend en UI-design) is nu **Claude**. Claude reviewt elke contractwijziging en elke wijziging aan de policy-engine en de betaalflow. Zie [[Taakverdeling]].

| | **Track A: Antigravity** (logica, geld, veiligheid) | **Track B: Claude** (UI-design, frontend) |
|---|---|---|
| Eigenaar van | `backend/`, `database/` (incl. **alle migraties**), `services/`, `apis/` (behalve `apis/src/mocks/`, incl. de Channel3-adapter), `frontend/src/app/api/`; tests in die workspaces | `frontend/` (behalve `frontend/src/app/api/`): design-richting, pagina's, `src/components/`, `src/hooks/`, styling/tokens; plus `apis/src/mocks/` |
| Pijler 1 | agent, policy-engine R1–R10, payment-orchestrator, auditketen | Purchasing-scherm, checklist-animatie, bon, AuditGrid |
| Pijler 3 | dispute-ingest, bewijs, gap-analyse, dossier, indienen | Disputes-queue en dossierscherm |
| Pijler 2 | Shield-regels, Claude-classificatie, denylist (R10) | Invoices-scherm met gemarkeerde signalen |
| Monitoring | logger, health, invarianten, `npm run eval` | statuspunt in de header, reset-knop |
| Werkt tegen | echte sandbox + unittests | **mock-data die aan de contracten voldoet** (`apis/src/mocks/`), tot track A de endpoint levert |

**Spelregels**
- Elke track een eigen branch/worktree (`feat/core` en `feat/ui`); **dagelijks mergen naar `main`** en de ander rebaset.
- Gedeelde bestanden (`apis/src/domain/`, `apis/src/contracts/`, alle `package.json`-bestanden, `frontend/.env.example`, `AGENTS.md`) wijzigt alleen track A; track B vraagt het aan.
- Afhankelijkheden alleen in de richting `frontend → backend → services → database → apis` (zie [[#Repo-indeling (besluit 30-10-2026)|repo-indeling]]); `npm run contracts:check` blijft de check dat mocks en endpoints aan de contracten voldoen.
- Alle checks (`typecheck`, `lint`, `test`, `contracts:check`) draaien vanuit de repo-root.
- Elke agent leest bij de start deze plannen en de repo-`AGENTS.md` met de eigendomsregels hierboven.
- Jij bent de integrator: na elke merge `npm run typecheck && npm test` en scène 1 in de browser.

**Wat het oplevert:** de UI hoeft niet meer te wachten op de logica. Pijler 2 en 3 kunnen elk 1 dag eerder klaar zijn, waardoor 7-8 november ruimte geven voor polish en hardening in plaats van bouwen.

### Schrapregels
- **Eind 2-11 pijler 1 niet end-to-end?** Pijler 2 wordt een slide. Pijler 3 alleen als het op 4-11 klaar is.
- **Eind 4-11 pijler 3 niet klaar?** Pijler 2 wordt een slide; de dag gaat naar pijler 3.
- **Featurefreeze 6-11 is hard.** Wat dan niet werkt, gaat niet in de video.
- **De video blijft 3 minuten.** Met drie pijlers: pijler 1 krijgt ~1:30, pijler 3 ~0:40, pijler 2 ~0:25. Zie [[Video-draaiboek]] (moet nog worden aangepast).
