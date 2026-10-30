# 04 API's

Terug naar [[00 Overzicht]] · Gebruikt door: [[01 Frontend]], [[02 Backend]], [[05 Services]]

Twee kanten: **ons eigen HTTP-contract** (wat de frontend en PayPal aanroepen) en **adapters naar externe API's** (PayPal, Channel3, Claude).

## Plan
**Doel:** elke grens met de buitenwereld heeft een vast, gevalideerd contract, zodat een wijziging aan één kant niet stil de andere kant breekt.

**Requirements**
- Elk eigen endpoint heeft een zod-schema voor request en response; types worden daaruit afgeleid.
- Elke externe API zit achter één adapter die onze domeintypes teruggeeft, nooit de ruwe externe JSON.
- Elke PayPal-mutatie stuurt een `PayPal-Request-Id`.
- Webhooks: handtekening verifiëren (werkt al), idempotent verwerken.

**Eerst verifiëren in de docs (vóór bouwen)**
- [ ] **Invoicing API:** kan een ontvanger facturen ophalen die naar hem zijn gestuurd? (Verwachting: nee.)
- [ ] **Disputes API in de sandbox:** hoe open je een dispute als sandbox-buyer, en welke webhooks komen er (`CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED`)?
- [ ] **`provide-evidence`:** verplichte velden en bijlageformaten (multipart).
- [ ] **Tracking:** `POST /v2/checkout/orders/{id}/track` voor verzendbewijs bij pijler 3.
- [ ] **Channel3:** welke velden komen terug (prijs, valuta, verkoper, land, rating, verzendkosten, voorraad)? Rate limits?

**Buiten scope:** publieke API voor derden, GraphQL, API-versionering.

## Design
### Eigen HTTP-contract
| Methode + pad | Pijler | Doel | Auth |
|---|---|---|---|
| `GET /api/health` | — | db + upstream-bereikbaarheid | open |
| `GET /api/policies/:id` | 1 | actieve policy + versie | demo |
| `POST /api/policies/:id/versions` | 1 | nieuwe policy-versie (UI) | demo |
| `POST /api/runs` | 1 | `{ policyId, command }` → start agent-run, geeft `runId` | demo |
| `GET /api/runs/:id/stream` | 1 | SSE: `step`, `proposal`, `check`, `decision`, `payment`, `error` | demo |
| `POST /api/runs/:id/approve` | 1 | NEEDS_APPROVAL → capture | demo |
| `POST /api/invoices` | 2 | `{ text }` of multipart-bestand → analyse | demo |
| `POST /api/invoices/:id/block-payee` | 2 | ontvanger op denylist | demo |
| `GET /api/disputes` | 3 | queue | demo |
| `POST /api/disputes/:id/dossier` | 3 | dossier (opnieuw) genereren | demo |
| `POST /api/disputes/:id/submit` | 3 | goedgekeurd dossier indienen | demo |
| `GET /api/audit` | alle | gefilterd auditlog (voor AG Grid) | demo |
| `POST /api/paypal/webhook` | 1, 3 | bestaat al | PayPal-handtekening |
| `GET /api/shops/:id/quote` | 1 | bestaat al | open |
| `POST /api/demo/reset` | — | reset | `DEMO_ADMIN_TOKEN` |

Responses: `{ data }` bij succes, `{ error: AppError }` bij een fout (zie [[02 Backend#Design|foutmodel]]).

### PayPal-adapter
| Module | Endpoints | Opmerking |
|---|---|---|
| `orders.ts` | create (intent AUTHORIZE, `payee.email_address`, vault-ID), get, authorize, capture, void, track | bestaat grotendeels |
| `vault.ts` | vault-ID uitlezen na eerste goedkeuring | werkt al (plan A) |
| `webhooks.ts` | verify-webhook-signature, event-typen → handlers | werkt al |
| `disputes.ts` | list, get, provide-evidence, accept-claim (alleen handmatig) | nieuw |
| `invoicing.ts` | create + send (alleen voor het **geënsceneerde** scamscenario vanaf een "scammer"-sandboxaccount) | nieuw, zie [[05 Services#Invoice Shield (pijler 2)]] |

- Tokens cachen tot vlak voor `expires_in` (bestaat).
- Elke fout → `AppError{ code: "UPSTREAM", upstream: { service: "paypal", debugId } }`.
- Sandbox en live alleen via `PAYPAL_BASE_URL`; geen if-sandbox-logica in de code.

### Channel3-adapter
- `searchProducts(query, filters) → Product[]` en `getProduct(id) → Product`, gemapt naar het bestaande `Product`-type uit `shops.ts`, met `source: "channel3" | "demo"`.
- Ontbrekende velden worden `undefined` (niet verzonnen); de policy-engine faalt een regel als het bewijs ontbreekt ("unknown = fail").
- Response-cache 10 min in-memory (demo stabiel, rate limit sparen).

### Claude-adapter
- `@anthropic-ai/sdk`, modellen via env: agent en dossier `claude-sonnet-5-5`, factuur-triage `claude-haiku-5-5`.
- Tools voor de agent: `search_products`, `get_product`, `propose_purchase`. **Geen** tool die betaalt of de policy wijzigt.
- Structured output: elk tool-argument en elke eindoutput door zod; bij ongeldig één herstelpoging, daarna `FAILED`.
- Vision voor factuurbijlagen (PDF/afbeelding): geen aparte OCR-dienst nodig.
- Prompt caching op de systeemprompt + tooldefinities.

## Structure
```
src/app/api/<resource>/route.ts      dunne handlers via route()-wrapper
src/contracts/                        zod-schema's per endpoint (gedeeld met frontend)
  runs.ts  policies.ts  invoices.ts  disputes.ts  audit.ts  events.ts
src/adapters/paypal/  channel3/  llm/
tests/contract/                       schema-tests + opgenomen voorbeeldresponses (fixtures)
```
**Conventies:** padnamen meervoud; acties als sub-resource (`/submit`, `/approve`); adapters exporteren functies, geen klassen; fixtures van echte sandbox-responses opslaan in `tests/fixtures/` (zonder secrets) zodat tests offline draaien.

## Scale
**Voor de demo**
- Fallback als Channel3 traag of leeg is: demowinkels blijven werken; UI toont de bron per product.
- Webhook-vangnet: cron-poll van disputes en orders voor het geval een webhook niet aankomt.

**Na de hackathon**
- PayPal live via Partner-integratie (merchant onboarding) en per-tenant credentials.
- Echte inbound-facturen: eigen inbound-mailadres per tenant (bv. Postmark/Mailgun inbound webhook) of Gmail-koppeling.
- Publieke API met keys + OpenAPI-spec gegenereerd uit de zod-contracten.
- Agentic-checkout-protocollen (PayPal Agent Toolkit e.d.) zodra verkopers dat ondersteunen, in plaats van eigen demowinkels.
