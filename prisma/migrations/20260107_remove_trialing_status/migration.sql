-- AlterEnum: Remove 'trialing' from SubscriptionStatus enum
-- First, update any existing 'trialing' records to 'active'
UPDATE "users" SET "subscription_status" = 'active' WHERE "subscription_status" = 'trialing';

-- Remove the default before altering the type
ALTER TABLE "users" ALTER COLUMN "subscription_status" DROP DEFAULT;

-- Then remove the 'trialing' value from the enum
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due');
ALTER TABLE "users" ALTER COLUMN "subscription_status" TYPE "SubscriptionStatus" USING ("subscription_status"::text::"SubscriptionStatus");
DROP TYPE "SubscriptionStatus_old";

-- Re-add the default value
ALTER TABLE "users" ALTER COLUMN "subscription_status" SET DEFAULT 'active';
