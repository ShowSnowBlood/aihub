-- CreateTable
CREATE TABLE "knowledge_vectors" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceSlug" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "text" TEXT NOT NULL,
    "keywords" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_vectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_vectors_fingerprint_key" ON "knowledge_vectors"("fingerprint");

-- CreateIndex
CREATE INDEX "knowledge_vectors_scope_idx" ON "knowledge_vectors"("scope");

-- CreateIndex
CREATE INDEX "knowledge_vectors_sourceType_idx" ON "knowledge_vectors"("sourceType");

-- CreateIndex
CREATE INDEX "knowledge_vectors_sourceSlug_idx" ON "knowledge_vectors"("sourceSlug");

-- CreateIndex
CREATE INDEX "knowledge_vectors_score_idx" ON "knowledge_vectors"("score");
