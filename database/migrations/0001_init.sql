-- 0001_init.sql: Initial payments and PayPal webhook idempotency tables (extracted from client.ts).

CREATE TABLE IF NOT EXISTS payments (
  order_id          text PRIMARY KEY,
  authorization_id  text,
  capture_id        text,
  shop_id           text,
  description       text,
  amount            numeric(10, 2),
  currency          text,
  payee_email       text,
  status            text NOT NULL,
  webhook_verified  boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           text PRIMARY KEY,
  event_type   text NOT NULL,
  resource_id  text,
  order_id     text,
  verified     boolean NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL
);
