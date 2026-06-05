-- Create user_achievements table for 12-badge achievement system
CREATE TABLE IF NOT EXISTS "user_achievements" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "achievement_id" VARCHAR(50) NOT NULL,
    "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("user_id", "achievement_id")
);

CREATE INDEX IF NOT EXISTS "user_achievements_user_id_idx" ON "user_achievements" ("user_id");
