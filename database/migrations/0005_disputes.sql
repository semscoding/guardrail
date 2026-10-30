-- 0005_disputes.sql: Pillar 3 Dispute Defender queue, evidence items, and versioned dossiers.

CREATE TABLE IF NOT EXISTS disputes (
  id                   text PRIMARY KEY,
  order_id             text,
  reason               text NOT NULL,
  status               text NOT NULL,
  amount               numeric(10, 2) NOT NULL,
  currency             char(3) NOT NULL DEFAULT 'EUR',
  seller_response_due  timestamptz,
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_seller_response_due ON disputes (seller_response_due);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id            text PRIMARY KEY,
  dispute_id    text NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('ORDER', 'TRACKING', 'ADDRESS', 'COMMUNICATION', 'REFUND_POLICY')),
  source        text NOT NULL CHECK (source IN ('paypal_order', 'paypal_capture', 'shipping', 'club_shop', 'email')),
  summary       text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_id ON dispute_evidence (dispute_id);

CREATE TABLE IF NOT EXISTS dispute_dossiers (
  dispute_id        text NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  version           integer NOT NULL CHECK (version > 0),
  strength          text NOT NULL CHECK (strength IN ('STRONG', 'WEAK')),
  missing_evidence  jsonb NOT NULL DEFAULT '[]'::jsonb,
  body              jsonb NOT NULL,
  status            text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'SUBMITTED', 'FAILED')),
  approved_by       text,
  approved_at       timestamptz,
  submitted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dispute_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_dossiers_one_submitted
  ON dispute_dossiers (dispute_id)
  WHERE status = 'SUBMITTED';
