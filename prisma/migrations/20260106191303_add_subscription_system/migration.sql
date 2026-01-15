-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'premium', 'lifetime');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due', 'trialing');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripe_customer_id" VARCHAR(255),
ADD COLUMN     "stripe_subscription_id" VARCHAR(255),
ADD COLUMN     "subscription_end_date" TIMESTAMP(3),
ADD COLUMN     "subscription_start_date" TIMESTAMP(3),
ADD COLUMN     "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "old_tier" VARCHAR(20),
    "new_tier" VARCHAR(20),
    "old_status" VARCHAR(20),
    "new_status" VARCHAR(20),
    "stripe_event_id" VARCHAR(255),
    "metadata" JSONB,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifetime_grants" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "granted_by" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifetime_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_subscription_events_user" ON "subscription_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscription_events_type" ON "subscription_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_subscription_events_date" ON "subscription_events"("created_date");

-- CreateIndex
CREATE INDEX "idx_lifetime_grants_user" ON "lifetime_grants"("user_id");

-- CreateIndex
CREATE INDEX "idx_users_subscription" ON "users"("subscription_tier", "subscription_status");

-- CreateIndex
CREATE INDEX "idx_users_stripe_customer" ON "users"("stripe_customer_id");

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifetime_grants" ADD CONSTRAINT "lifetime_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
