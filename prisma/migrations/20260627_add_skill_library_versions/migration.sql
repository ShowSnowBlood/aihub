CREATE TABLE IF NOT EXISTS "skill_library_versions" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL UNIQUE,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "packageName" TEXT,
  "packagePath" TEXT,
  "packageSize" INTEGER NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "notes" TEXT,
  "operator" TEXT,
  "jobId" TEXT,
  "skillCount" INTEGER NOT NULL DEFAULT 0,
  "externalSkillCount" INTEGER NOT NULL DEFAULT 0,
  "promptCount" INTEGER NOT NULL DEFAULT 0,
  "newsCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "skill_library_versions_status_idx" ON "skill_library_versions"("status");
CREATE INDEX IF NOT EXISTS "skill_library_versions_createdAt_idx" ON "skill_library_versions"("createdAt");
