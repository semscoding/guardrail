-- 0003_audit.sql: Append-only, hash-chained audit_events table with UPDATE/DELETE prohibition trigger.

CREATE TABLE IF NOT EXISTS audit_events (
  seq        bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  pillar     text NOT NULL CHECK (pillar IN ('purchasing', 'invoices', 'disputes', 'system')),
  actor      text NOT NULL CHECK (actor IN ('agent', 'engine', 'user', 'paypal', 'system')),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  outcome    text,
  summary    text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash  text NOT NULL,
  hash       text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity, entity_id);

CREATE OR REPLACE FUNCTION forbid_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION forbid_audit_mutation();
