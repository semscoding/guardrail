-- 0002_policies_runs.sql: Pillar 1 versioned policies, agent runs, proposals, and policy decisions.

CREATE TABLE IF NOT EXISTS policies (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  active_version  integer NOT NULL DEFAULT 1 CHECK (active_version > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_versions (
  policy_id      text NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version        integer NOT NULL CHECK (version > 0),
  name           text NOT NULL,
  rules          jsonb NOT NULL,
  valid_until    timestamptz NOT NULL,
  vault_id       text,
  paypal_linked  boolean NOT NULL DEFAULT false,
  created_by     text NOT NULL DEFAULT 'system',
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id              text PRIMARY KEY,
  policy_id       text NOT NULL,
  policy_version  integer NOT NULL,
  command         text NOT NULL,
  status          text NOT NULL CHECK (status IN ('RUNNING', 'PROPOSED', 'ALLOWED', 'BLOCKED', 'NEEDS_APPROVAL', 'FAILED')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  llm_tokens_in   integer NOT NULL DEFAULT 0,
  llm_tokens_out  integer NOT NULL DEFAULT 0,
  FOREIGN KEY (policy_id, policy_version) REFERENCES policy_versions(policy_id, version)
);

CREATE INDEX IF NOT EXISTS idx_runs_policy_started_at ON runs (policy_id, started_at DESC);

CREATE TABLE IF NOT EXISTS run_events (
  run_id   text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq      integer NOT NULL CHECK (seq > 0),
  type     text NOT NULL,
  payload  jsonb NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS proposals (
  id                text PRIMARY KEY,
  run_id            text NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  shop_id           text NOT NULL,
  product_id        text NOT NULL,
  source            text NOT NULL CHECK (source IN ('demo', 'channel3')),
  quantity          integer NOT NULL CHECK (quantity >= 1),
  claimed_total     numeric(10, 2),
  claimed_currency  char(3),
  raw               jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_decisions (
  id          text PRIMARY KEY,
  run_id      text UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  invoice_id  text,
  outcome     text NOT NULL CHECK (outcome IN ('ALLOW', 'BLOCK', 'NEEDS_APPROVAL', 'SAFE', 'SUSPICIOUS', 'SCAM')),
  checks      jsonb NOT NULL,
  decided_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS run_id text REFERENCES runs(id),
  ADD COLUMN IF NOT EXISTS request_id text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_payments_status_created_at ON payments (status, created_at);
