-- 0004_invoices.sql: Pillar 2 Invoice Shield inbound invoices, signal spans, and payee denylist.

CREATE TABLE IF NOT EXISTS inbound_invoices (
  id                 text PRIMARY KEY,
  source             text NOT NULL CHECK (source IN ('PASTE', 'UPLOAD', 'PAYPAL_SANDBOX')),
  paypal_invoice_id  text,
  payee_email        text,
  amount             numeric(10, 2),
  currency           char(3),
  raw_text           text NOT NULL,
  attachment_ref     text,
  verdict            text NOT NULL CHECK (verdict IN ('SAFE', 'SUSPICIOUS', 'SCAM')),
  payee_blocked      boolean NOT NULL DEFAULT false,
  received_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_findings (
  id           bigserial PRIMARY KEY,
  invoice_id   text NOT NULL REFERENCES inbound_invoices(id) ON DELETE CASCADE,
  signal       text NOT NULL CHECK (signal IN (
    'PHONE_NUMBER',
    'BRAND_IMPERSONATION',
    'URGENCY',
    'CALL_TO_CANCEL',
    'UNKNOWN_PAYEE',
    'CRYPTO',
    'AMOUNT_PATTERN',
    'OTHER'
  )),
  span_start   integer NOT NULL CHECK (span_start >= 0),
  span_end     integer NOT NULL CHECK (span_end >= span_start),
  excerpt      text NOT NULL,
  explanation  text NOT NULL,
  rule_or_llm  text NOT NULL CHECK (rule_or_llm IN ('rule', 'llm'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_findings_invoice_id ON invoice_findings (invoice_id);

CREATE TABLE IF NOT EXISTS payee_denylist (
  payee_email        text PRIMARY KEY,
  reason             text NOT NULL,
  source_invoice_id  text REFERENCES inbound_invoices(id) ON DELETE SET NULL,
  added_by           text NOT NULL DEFAULT 'user',
  added_at           timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_decisions_invoice_id_fkey'
  ) THEN
    ALTER TABLE policy_decisions
      ADD CONSTRAINT policy_decisions_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES inbound_invoices(id) ON DELETE CASCADE;
  END IF;
END
$$;
