ALTER TABLE "ProductionJob"
  ADD COLUMN "creationId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerMetadata" JSONB,
  ADD COLUMN "actualDuration" INTEGER,
  ADD COLUMN "generationAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "lastPolledAt" TIMESTAMP(3),
  ADD COLUMN "nextPollAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "ProductionJob_status_nextPollAt_idx" ON "ProductionJob"("status", "nextPollAt");
CREATE INDEX "ProductionJob_provider_creationId_idx" ON "ProductionJob"("provider", "creationId");
