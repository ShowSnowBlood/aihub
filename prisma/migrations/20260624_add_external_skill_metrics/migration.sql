ALTER TABLE "external_skills"
  ADD COLUMN IF NOT EXISTS "stars" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "forks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "downloads" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "external_skills_stars_idx" ON "external_skills"("stars");
CREATE INDEX IF NOT EXISTS "external_skills_downloads_idx" ON "external_skills"("downloads");
