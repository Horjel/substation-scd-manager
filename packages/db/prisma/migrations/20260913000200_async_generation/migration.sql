ALTER TABLE "ScdGeneration"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attemptToken" UUID,
  ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ(3);

CREATE TABLE "GenerationOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "generationId" UUID NOT NULL,
  "eventName" VARCHAR(64) NOT NULL,
  "payloadVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  "publishAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" VARCHAR(1000),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "generationId" UUID NOT NULL,
  "storageProvider" VARCHAR(32) NOT NULL,
  "storageKey" VARCHAR(255) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScdGeneration_active_revision_generator_key"
  ON "ScdGeneration" ("revisionId", "generatorVersion")
  WHERE "status" IN ('QUEUED', 'RUNNING');

CREATE UNIQUE INDEX "GenerationOutbox_generationId_key" ON "GenerationOutbox"("generationId");
CREATE INDEX "GenerationOutbox_publishedAt_nextAttemptAt_createdAt_idx"
  ON "GenerationOutbox"("publishedAt", "nextAttemptAt", "createdAt");
CREATE UNIQUE INDEX "GeneratedArtifact_generationId_key" ON "GeneratedArtifact"("generationId");
CREATE UNIQUE INDEX "GeneratedArtifact_storageKey_key" ON "GeneratedArtifact"("storageKey");
CREATE INDEX "GeneratedArtifact_checksum_idx" ON "GeneratedArtifact"("checksum");

ALTER TABLE "ScdGeneration"
  ADD CONSTRAINT "ScdGeneration_attemptCount_check" CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "ScdGeneration_state_shape_check" CHECK (
    ("status" = 'QUEUED' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "attemptToken" IS NULL AND "leaseExpiresAt" IS NULL)
    OR
    ("status" = 'RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "attemptToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
    OR
    ("status" IN ('SUCCEEDED', 'FAILED') AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "attemptToken" IS NULL AND "leaseExpiresAt" IS NULL)
  );

ALTER TABLE "GenerationOutbox"
  ADD CONSTRAINT "GenerationOutbox_generationId_fkey"
    FOREIGN KEY ("generationId") REFERENCES "ScdGeneration"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GenerationOutbox_contract_check"
    CHECK ("eventName" = 'generate-scd.v1' AND "payloadVersion" = 1),
  ADD CONSTRAINT "GenerationOutbox_attempts_check" CHECK ("publishAttempts" >= 0);

ALTER TABLE "GeneratedArtifact"
  ADD CONSTRAINT "GeneratedArtifact_generationId_fkey"
    FOREIGN KEY ("generationId") REFERENCES "ScdGeneration"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GeneratedArtifact_provider_check" CHECK ("storageProvider" = 'postgresql'),
  ADD CONSTRAINT "GeneratedArtifact_mime_check" CHECK ("mimeType" = 'application/xml'),
  ADD CONSTRAINT "GeneratedArtifact_size_check"
    CHECK ("byteSize" > 0 AND "byteSize" <= 1048576 AND octet_length("content") = "byteSize"),
  ADD CONSTRAINT "GeneratedArtifact_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "GeneratedArtifact_filename_check" CHECK ("fileName" ~ '\.scd$');
