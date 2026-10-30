# 03 Database

Terug naar [[00 Overzicht]] · Gebruikt door: [[02 Backend]], [[05 Services]]

## Plan
**Doel:** één betrouwbare bron van waarheid voor policies, runs, beslissingen, betalingen, facturen en disputes, met een auditspoor dat aantoonbaar niet achteraf is aangepast.

**Requirements**
- Zelfde SQL lokaal (PGlite in `.data/`) en op Render (Postgres): dat werkt al.
- Versiebeheerde migraties in plaats van het huidige `CREATE TABLE IF NOT EXISTS`-blok.
- Policies zijn **geversioneerd**: een beslissing verwijst naar de exacte policy-versie die gold.
- Auditlog is **append-only** met een hashketen.
- Seed-data voor de demo + reset in één commando.

**Acceptatiecriteria**
- `npm run db:migrate` is idempotent; `npm run db:seed` zet de demo in een bekende staat.
- Een UPDATE of DELETE op `audit_events` wordt door de database geweigerd.
- `npm run audit:verify` controleert de hashketen en meldt de eerste kapotte schakel.

**Buiten scope:** ORM, read replicas, partitionering.

## Design
**Keuze: geen ORM.** De bestaande `db().query(sql, params)` blijft; types per repository met zod of handgeschreven mappers. Reden: werkt al op PGlite én Postgres, minder lagen, en voor ~14 tabellen is een ORM overbodig.

**Geld:** `numeric(10,2)` + `currency char(3)` in de database; in TypeScript `Money = { cents: number; currency: "EUR" }`. Conversie alleen in de repository-laag. Nooit `float`.

**Tabellen**
| Tabel | Pijler | Kernvelden |
|---|---|---|
| `policies` | 1 | id, name, active_version, created_at |
| `policy_versions` | 1 | policy_id, version, rules jsonb, valid_until, vault_id, created_by, created_at — immutable |
| `runs` | 1 | id, policy_id, policy_version, command, status (`RUNNING/PROPOSED/ALLOWED/BLOCKED/NEEDS_APPROVAL/FAILED`), started_at, finished_at, llm_tokens_in/out |
| `run_events` | 1 | run_id, seq, type, payload jsonb, at — voor stream-replay |
| `proposals` | 1 | id, run_id, shop_id, product_id, quantity, claimed_total, raw jsonb (wat de agent zei) |
| `policy_decisions` | 1, 2 | id, run_id/invoice_id, outcome, checks jsonb (`[{ruleId, passed, expected, actual, source}]`), decided_at |
| `payments` | 1 | bestaat al; + `run_id`, `request_id` (idempotentie) |
| `webhook_events` | 1, 3 | bestaat al; PK = PayPal event-ID = idempotentie |
| `payee_denylist` | 1, 2 | payee_email, reason, source_invoice_id, added_by, added_at |
| `inbound_invoices` | 2 | id, source (`PASTE/UPLOAD/PAYPAL_SANDBOX`), paypal_invoice_id, payee_email, amount, raw_text, attachment_ref, received_at |
| `invoice_findings` | 2 | invoice_id, signal (`PHONE_NUMBER/BRAND_IMPERSONATION/URGENCY/...`), span_start, span_end, evidence, rule_or_llm |
| `disputes` | 3 | id (PayPal dispute-ID), order_id, reason, status, amount, seller_response_due, raw jsonb, updated_at |
| `dispute_evidence` | 3 | dispute_id, kind (`TRACKING/ORDER/ADDRESS/COMMUNICATION`), source, payload jsonb, collected_at |
| `dispute_dossiers` | 3 | dispute_id, version, body jsonb, status (`DRAFT/APPROVED/SUBMITTED/FAILED`), approved_by, submitted_at |
| `audit_events` | alle | seq bigserial, at, actor (`agent/engine/user/paypal/system`), action, entity, entity_id, data jsonb, prev_hash, hash |

**Auditketen:** `hash = sha256(prev_hash || canonical_json(seq, at, actor, action, entity, entity_id, data))`. Wordt in de applicatie berekend binnen dezelfde transactie als de mutatie. Een trigger `BEFORE UPDATE OR DELETE ON audit_events` gooit een exceptie.

**Idempotentie**
- `payments.request_id` uniek = de `PayPal-Request-Id` die we meesturen.
- `webhook_events.id` = PayPal event-ID; `INSERT ... ON CONFLICT DO NOTHING` en alleen verwerken als de insert gelukt is.
- `dispute_dossiers`: één `SUBMITTED` per dispute (partiële unieke index).

**Indexen:** `runs(policy_id, started_at)`, `payments(status, created_at)` voor R2-maandsom, `disputes(seller_response_due)`, `audit_events(entity, entity_id)`.

## Structure
```
src/db/
  client.ts                bestaande db() (PGlite/Postgres)
  migrate.ts               leest migrations/*.sql op volgorde, houdt schema_migrations bij
  migrations/
    0001_init.sql          huidige payments + webhook_events
    0002_policies_runs.sql
    0003_audit.sql         + trigger
    0004_invoices.sql
    0005_disputes.sql
  seed.ts                  policy "Club Supplies", demowinkels, één sandbox-dispute-placeholder
  repositories/
    policies.ts runs.ts decisions.ts payments.ts audit.ts invoices.ts disputes.ts
```
**Conventies:** tabellen meervoud snake_case; elke migratie alleen vooruit (geen down); repositories geven domeintypes terug, nooit ruwe rijen; alle schrijfacties die een auditregel geven gebeuren in één transactie via `withTx(fn)`.

**Scripts:** `db:migrate`, `db:seed`, `db:reset` (drop + migrate + seed, alleen lokaal of met `DEMO_ADMIN_TOKEN`), `audit:verify`.

## Scale
**Voor de demo**
- Render Postgres (free/starter) met dagelijkse backup aan.
- Reset-demo wist runs, beslissingen, betalingen, facturen en disputes, maar laat de auditketen intact door een `DEMO_RESET`-event toe te voegen (eerlijker dan wissen).

**Na de hackathon**
- `tenant_id` op elke tabel + Row Level Security.
- Auditlog periodiek verankeren (hash van de laatste schakel extern vastleggen) voor echte tamper-evidence.
- Bewaartermijnen (AVG): factuurtekst en adressen na X maanden pseudonimiseren; bijlagen in object storage i.p.v. de database.
- `audit_events` partitioneren per maand zodra het groot wordt.
