# 05 Services

Terug naar [[00 Overzicht]] · Gebruikt: [[03 Database]], [[04 API's]] · Aangeroepen door: [[02 Backend]]

De services bevatten alle bedrijfslogica. Vijf stuks: **Agent**, **Policy-engine**, **Payment-orchestrator** (pijler 1), **Dispute Defender** (pijler 3) en **Invoice Shield** (pijler 2). Plus een gedeelde **Audit**-service.

## Plan
**Requirements**
| Service | Moet | Mag nooit |
|---|---|---|
| Agent | product zoeken, vergelijken, één gevalideerd `PurchaseProposal` opleveren | betalen, policy lezen of wijzigen, eigen output als bewijs laten tellen |
| Policy-engine | voorstel + echt PayPal-order + register → `ALLOW/BLOCK/NEEDS_APPROVAL` met `checks[]` | AI aanroepen, netwerk aanroepen (puur: alle input wordt meegegeven) |
| Payment-orchestrator | order maken (AUTHORIZE) → engine → capture of void | capturen zonder `ALLOW` of menselijke goedkeuring |
| Dispute Defender | bewijs verzamelen, dossier opstellen, na goedkeuring indienen | indienen zonder goedkeuring, claims accepteren |
| Invoice Shield | factuur beoordelen met regels + LLM, signalen met positie en bron | automatisch iets betalen of melden namens de gebruiker |
| Audit | elke beslissing en mutatie vastleggen in de hashketen | regels wijzigen of verwijderen |

**Acceptatiecriteria**
- Policy-engine: 100% regeldekking in unittests, inclusief €350,00 (ALLOW), €350,01 (BLOCK), verborgen verzendkosten, andere valuta, onbekende payee, ontbrekende rating, verlopen policy.
- Scenario-tests (met opgenomen fixtures) voor scène 1, scène 2, een dispute en een scamfactuur.
- Elke service is aan te roepen zonder HTTP (gewone functies met dependencies als parameter).

## Design
### Agent (pijler 1)
- Claude tool use, max. 8 tool-calls per run, lage temperature, vaste systeemprompt.
- Tools: `search_products(query)`, `get_product(source, id)`, `propose_purchase({ shopId, productId, quantity, reasoning })`.
- Elke tool-call en -resultaat → `run_events` (stream naar UI).
- Productpagina-tekst (incl. de injectie van dealzone-x) gaat als **data** naar de agent. We blokkeren de injectie bewust níet in de agent: het verhaal is dat de engine het opvangt.
- Uitkomst: `PurchaseProposal` (zod). Wat de agent beweert over verkoper of prijs wordt bewaard in `proposals.raw` maar nergens gebruikt voor de beslissing.

### Policy-engine (pijler 1 + 2)
```ts
evaluate(input: {
  policy: PolicyVersion;
  order: PayPalOrderFacts;      // uit GET order: amount, currency, payee
  product: ProductFacts;        // server-side opgehaald, niet van de agent
  seller?: RegisteredSeller;    // via sellerByPayee(order.payee)
  monthSpent: Money;            // som captures deze maand
  denylist: string[];           // van Invoice Shield
  now: Date;
}): Decision  // { outcome, checks: Check[] }
```
| ID | Regel | Bron |
|---|---|---|
| R1 | totaal ≤ limiet per aankoop | PayPal-order |
| R2 | maandbudget niet overschreden | auditlog/payments |
| R3 | valuta = EUR | PayPal-order |
| R4 | verkoper op whitelist en EU | register |
| R5 | payee = geregistreerde payee van de verkoper | PayPal-order vs. register |
| R6 | rating ≥ 4,0 | register (geverifieerd) |
| R7 | categorie toegestaan | productdata |
| R8 | policy niet verlopen | policy |
| R9 | bedrag > goedkeuringsgrens → NEEDS_APPROVAL | PayPal-order |
| **R10** | payee niet op denylist | `payee_denylist` (gevuld door pijler 2) |

Volgorde: alle regels worden altijd geëvalueerd (volledige checklist voor de UI). Uitkomst: één harde fout → BLOCK; anders R9 → NEEDS_APPROVAL; anders ALLOW. **Ontbrekend bewijs = gefaald**.

### Payment-orchestrator (pijler 1)
`proposal → createOrder(AUTHORIZE, vaultId, payee uit register van de voorgestelde winkel) → authorize → getOrder → evaluate → capture | void | wacht op goedkeuring`. Elke stap met `PayPal-Request-Id = runId:stap`. Captures worden pas definitief na de geverifieerde webhook (status in UI: "captured, confirmed by webhook").

### Dispute Defender (pijler 3)
1. **Ingest:** webhook `CUSTOMER.DISPUTE.CREATED` of cron-poll → `disputes`.
2. **Bewijs verzamelen (deterministisch):** order + capture uit PayPal, tracking (uit de order of eigen verzenddata), afleveradres, klantcommunicatie (seed). Elk stuk → `dispute_evidence` met bron + tijdstempel.
3. **Gap-analyse (code, geen AI):** per dispute-reden (`MERCHANDISE_OR_SERVICE_NOT_RECEIVED`, `UNAUTHORISED`, …) een checklist van wat Seller Protection vraagt. Ontbreekt bewijs → dossier krijgt status "zwak" en advies "overweeg te accepteren".
4. **Dossier opstellen (Claude):** alleen op basis van `dispute_evidence`; elke bewering verwijst naar een evidence-ID. Validatie: een zin zonder bronverwijzing wordt afgekeurd.
5. **Goedkeuren (mens) → indienen** via `provide-evidence`. Status + auditregel.

### Invoice Shield (pijler 2)
**Realistische invoer** (de Invoicing API levert geen inkomende facturen, zie [[04 API's#Plan]]):
- Demo: de gebruiker plakt de PayPal-notificatiemail of uploadt de factuur-PDF/screenshot.
- Geënsceneerd scenario: we versturen vanaf een "scammer"-sandboxaccount een echte PayPal-factuur (Invoicing API) naar het club-account, zodat het factuurnummer en de payee echt zijn. In de pitch eerlijk: *"staged scam invoice; in production invoices arrive via forwarded email"*.

**Analyse in twee lagen**
1. **Regels (deterministisch):** telefoonnummer in de notitie, bekende merknamen (McAfee, Norton, Geek Squad, Coinbase…) bij een onbekende payee, urgentiewoorden, "bel ons om te annuleren", payee niet in het register, bedrag in een typisch scampatroon.
2. **Claude (triage-model):** classificeert de social-engineeringtactiek en geeft spans terug; output via zod, elke span moet echt in de tekst voorkomen (anders weggegooid).

Oordeel: regels en LLM samen → `SAFE | SUSPICIOUS | SCAM`. Een LLM alleen kan nooit `SCAM` geven zonder minstens één regel-signaal.

**Acties (altijd na klik):** ontvanger op denylist (→ R10 blokkeert elke toekomstige betaling door de agent), en een vooringevuld meldbericht voor PayPal (gebruiker verstuurt zelf; **meldadres en -route verifiëren**).

### Audit (alle)
`record(actor, action, entity, id, data)` binnen dezelfde transactie als de mutatie; berekent de hash; zie [[03 Database#Design|auditketen]].

## Structure
```
src/services/
  agent/            run.ts  tools.ts  prompt.ts
  policy/           evaluate.ts  rules/r01-limit.ts … r10-denylist.ts  types.ts
  payments/         orchestrate.ts  approve.ts
  catalog/          registry.ts  shops.ts  channel3Search.ts   (bestaande code)
  disputes/         ingest.ts  collectEvidence.ts  requirements.ts  draftDossier.ts  submit.ts
  invoices/         ingest.ts  rules.ts  classify.ts  verdict.ts  actions.ts
  audit/            record.ts  verify.ts
tests/unit/policy/  één testbestand per regel
tests/scenarios/    scene1.test.ts  scene2.test.ts  dispute-inr.test.ts  scam-invoice.test.ts
```
**Conventies:** één regel = één bestand met `id`, `description`, `evaluate()`; services exporteren één hoofdfunctie per use case; alle LLM-prompts in eigen `prompt.ts`-bestanden, met versienummer dat in `run_events` wordt gelogd.

## Scale
**Voor de demo**
- Agent-runs deterministisch maken: vaste demodata, temperature laag, scènes los opnemen.
- Engine-uitleg leesbaar: elke `Check` heeft een korte zin voor de UI ("€389.00 > €350.00 limit").

**Na de hackathon**
- Policy-DSL of -templates per type organisatie; meerdere policies per team.
- Lerende Invoice Shield: gemelde payees delen tussen tenants (met toestemming).
- Dispute Defender met echte verzenddata (PostNL/DHL-API's) en klantcommunicatie uit e-mail.
- Evaluatieset uitbreiden met echte (geanonimiseerde) scamfacturen en disputes.
