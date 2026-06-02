CREATE TYPE "SubscriptionProvider" AS ENUM (
  'stripe',
  'apple',
  'manual'
);

ALTER TABLE "users"
  ADD COLUMN "subscription_provider" "SubscriptionProvider",
  ADD COLUMN "apple_original_transaction_id" VARCHAR(255),
  ADD COLUMN "apple_product_id" VARCHAR(255);

UPDATE "users"
SET "subscription_provider" = 'stripe'
WHERE
  ("stripe_customer_id" IS NOT NULL OR "stripe_subscription_id" IS NOT NULL)
  AND "subscription_status" IN ('active', 'past_due');

UPDATE "users"
SET "subscription_provider" = 'manual'
WHERE
  "subscription_provider" IS NULL
  AND "subscription_tier" = 'lifetime'
  AND "stripe_customer_id" IS NULL
  AND "stripe_subscription_id" IS NULL;
