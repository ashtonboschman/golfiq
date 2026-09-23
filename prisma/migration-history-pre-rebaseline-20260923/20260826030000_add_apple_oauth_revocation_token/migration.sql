ALTER TABLE "oauth_accounts"
ADD COLUMN "refresh_token_encrypted" TEXT,
ADD COLUMN "refresh_token_client_id" VARCHAR(255);
