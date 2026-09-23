ALTER TYPE "SubscriptionProvider" ADD VALUE 'revenuecat_web';

CREATE TABLE "revenuecat_webhook_events" (
  "id" BIGSERIAL NOT NULL,
  "event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "app_user_id" VARCHAR(255),
  "product_id" VARCHAR(255),
  "store" VARCHAR(64),
  "environment" VARCHAR(32),
  "processed_at" TIMESTAMPTZ(6),
  "raw_event" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "revenuecat_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revenuecat_webhook_events_event_id_key" ON "revenuecat_webhook_events"("event_id");
CREATE INDEX "idx_rc_webhook_events_type" ON "revenuecat_webhook_events"("event_type");
CREATE INDEX "idx_rc_webhook_events_app_user" ON "revenuecat_webhook_events"("app_user_id");
CREATE INDEX "idx_rc_webhook_events_created" ON "revenuecat_webhook_events"("created_at");
