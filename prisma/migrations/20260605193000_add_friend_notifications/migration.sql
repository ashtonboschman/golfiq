CREATE TYPE "FriendNotificationType" AS ENUM ('friend_request_accepted');

CREATE TABLE "friend_notifications" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT NOT NULL,
  "actor_user_id" BIGINT NOT NULL,
  "type" "FriendNotificationType" NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_friend_notifications_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_friend_notifications_actor"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_friend_notifications_user_read_created"
  ON "friend_notifications"("user_id", "read_at", "created_at");

CREATE INDEX "idx_friend_notifications_actor"
  ON "friend_notifications"("actor_user_id");
