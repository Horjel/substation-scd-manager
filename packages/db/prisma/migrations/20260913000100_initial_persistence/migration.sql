-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ScdGenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Substation" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Substation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigurationRevision" (
    "id" UUID NOT NULL,
    "substationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigurationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScdGeneration" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "generatorVersion" VARCHAR(64) NOT NULL,
    "status" "ScdGenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "errorMessage" VARCHAR(2000),

    CONSTRAINT "ScdGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfigurationRevision_substationId_contentHash_idx" ON "ConfigurationRevision"("substationId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationRevision_substationId_version_key" ON "ConfigurationRevision"("substationId", "version");

-- CreateIndex
CREATE INDEX "ScdGeneration_revisionId_createdAt_idx" ON "ScdGeneration"("revisionId", "createdAt");

-- CreateIndex
CREATE INDEX "ScdGeneration_status_createdAt_idx" ON "ScdGeneration"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ConfigurationRevision" ADD CONSTRAINT "ConfigurationRevision_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ScdGeneration" ADD CONSTRAINT "ScdGeneration_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ConfigurationRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Custom invariants (preserve in future migrations; not expressible in Prisma schema).
ALTER TABLE "Substation" ADD CONSTRAINT "Substation_name_nonempty" CHECK (length(btrim("name")) > 0);
ALTER TABLE "ConfigurationRevision" ADD CONSTRAINT "ConfigurationRevision_version_positive" CHECK ("version" > 0);
ALTER TABLE "ConfigurationRevision" ADD CONSTRAINT "ConfigurationRevision_content_object" CHECK (jsonb_typeof("content") = 'object');
ALTER TABLE "ConfigurationRevision" ADD CONSTRAINT "ConfigurationRevision_hash_sha256" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ScdGeneration" ADD CONSTRAINT "ScdGeneration_generator_nonempty" CHECK (length(btrim("generatorVersion")) > 0);

CREATE FUNCTION reject_configuration_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ConfigurationRevision is immutable; create a new revision instead'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER configuration_revision_immutable
BEFORE UPDATE OR DELETE ON "ConfigurationRevision"
FOR EACH ROW EXECUTE FUNCTION reject_configuration_revision_mutation();
