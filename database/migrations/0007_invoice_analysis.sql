-- 0007_invoice_analysis.sql: record how each inbound invoice was analysed (LLM or labelled offline
-- test mode) and the tactic the LLM named, so the UI never presents rule output as AI.

ALTER TABLE inbound_invoices ADD COLUMN IF NOT EXISTS analysis_mode text NOT NULL DEFAULT 'offline'
  CHECK (analysis_mode IN ('anthropic', 'offline', 'failed'));
ALTER TABLE inbound_invoices ADD COLUMN IF NOT EXISTS tactic text;
