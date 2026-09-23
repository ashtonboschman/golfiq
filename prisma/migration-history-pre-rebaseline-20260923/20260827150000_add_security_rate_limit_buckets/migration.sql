CREATE TABLE "security_rate_limit_buckets" (
    "key" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "idx_security_rate_limit_buckets_reset_at"
ON "security_rate_limit_buckets"("reset_at");
