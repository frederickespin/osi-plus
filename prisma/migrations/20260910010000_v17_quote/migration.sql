-- CreateEnum
CREATE TYPE "QuoteProposalState" AS ENUM ('DRAFT', 'READY', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteLineSourceKind" AS ENUM ('COSTING', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuoteLinePriceStatus" AS ENUM ('CONFIRMED', 'PENDING');

-- CreateEnum
CREATE TYPE "QuoteDispatchChannel" AS ENUM ('MANUAL', 'EMAIL', 'WHATSAPP', 'PORTAL');

-- CreateEnum
CREATE TYPE "QuoteClientDecisionKind" AS ENUM ('ACCEPTED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "osi_pipeline_case_quotes" DROP CONSTRAINT "osi_pipeline_case_quotes_caseId_fkey";

-- DropIndex
DROP INDEX "osi_pipeline_case_quotes_caseId_version_idx";

-- AlterTable: tenant scope is a technical adoption only; legacy commercial content is not inferred.
ALTER TABLE "osi_pipeline_case_quotes" ADD COLUMN "contract_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "costing_revision_id" TEXT,
ADD COLUMN "cycle_number" INTEGER,
ADD COLUMN "public_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "tenant_id" TEXT;

UPDATE "osi_pipeline_case_quotes" AS q
SET "tenant_id" = c."tenant_id"
FROM "osi_pipeline_cases" AS c
WHERE c."id" = q."caseId" AND c."tenant_id" IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "osi_pipeline_case_quotes" WHERE "tenant_id" IS NULL) THEN
    RAISE EXCEPTION 'QUOTE_TENANT_BACKFILL_INCOMPLETE';
  END IF;
END $$;

WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "tenant_id", "caseId" ORDER BY "createdAt", "id") AS value
  FROM "osi_pipeline_case_quotes"
)
UPDATE "osi_pipeline_case_quotes" AS q SET "cycle_number" = numbered.value FROM numbered WHERE numbered."id" = q."id";

ALTER TABLE "osi_pipeline_case_quotes" ALTER COLUMN "tenant_id" SET NOT NULL,
ALTER COLUMN "cycle_number" SET NOT NULL,
ALTER COLUMN "cycle_number" SET DEFAULT 1;

-- CreateTable
CREATE TABLE "quote_proposals" (
    "id" TEXT NOT NULL,
    "proposal_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "state" "QuoteProposalState" NOT NULL DEFAULT 'DRAFT',
    "current_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_proposal_revisions" (
    "id" TEXT NOT NULL,
    "revision_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "costing_revision_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "state" "QuoteProposalState" NOT NULL,
    "proposal_name" VARCHAR(120) NOT NULL,
    "costing_logical_sha256" CHAR(64) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issue_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "commercial_context_snapshot" JSONB NOT NULL,
    "payer_snapshot" JSONB NOT NULL,
    "terms_snapshot" JSONB NOT NULL,
    "exchange_snapshot" JSONB,
    "discount_snapshot" JSONB,
    "totals_snapshot" JSONB NOT NULL,
    "margin_authorization_snapshot" JSONB,
    "internal_snapshot" JSONB NOT NULL,
    "client_snapshot" JSONB NOT NULL,
    "logical_sha256" CHAR(64) NOT NULL,
    "supersedes_revision_id" TEXT,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_proposal_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "line_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "source_kind" "QuoteLineSourceKind" NOT NULL,
    "costing_line_ref" UUID,
    "source_ref" VARCHAR(191) NOT NULL,
    "source_version" INTEGER NOT NULL,
    "concept" VARCHAR(240) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "economic_class" "CostingEconomicClass" NOT NULL,
    "price_status" "QuoteLinePriceStatus" NOT NULL,
    "captured_cost" DECIMAL(18,6),
    "suggested_price" DECIMAL(18,6),
    "quoted_price" DECIMAL(18,6),
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(1000),
    "position" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_issues" (
    "id" TEXT NOT NULL,
    "issue_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "severity" "CostingIssueSeverity" NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "status" "CostingIssueStatus" NOT NULL DEFAULT 'OPEN',
    "source_snapshot" JSONB NOT NULL,

    CONSTRAINT "quote_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_dispatches" (
    "id" TEXT NOT NULL,
    "dispatch_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "channel" "QuoteDispatchChannel" NOT NULL,
    "recipient_snapshot" JSONB NOT NULL,
    "evidence_ref" VARCHAR(191),
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_client_decisions" (
    "id" TEXT NOT NULL,
    "decision_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "decision" "QuoteClientDecisionKind" NOT NULL,
    "method" VARCHAR(80) NOT NULL,
    "decided_by_snapshot" JSONB NOT NULL,
    "evidence_ref" VARCHAR(191) NOT NULL,
    "reason" VARCHAR(1000),
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_client_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_mutation_commands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quote_id" TEXT,
    "request_id" UUID NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "target_ref" VARCHAR(191) NOT NULL,
    "result_json" JSONB NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_mutation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_reference_counters" (
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_reference_counters_pkey" PRIMARY KEY ("tenant_id","year")
);

ALTER TABLE "osi_pipeline_case_quotes" ADD CONSTRAINT "quote_cycles_contract_check" CHECK (
  "cycle_number" > 0 AND "contract_version" IN (1, 2)
);
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_position_check" CHECK (
  "position" BETWEEN 1 AND 3 AND "current_revision" >= 0
);
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_reference_check" CHECK (
  "reference" ~ '^Q-[0-9]{4}-[0-9]{6}-[ABC]$'
);
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_values_check" CHECK (
  "revision" > 0 AND "valid_until" >= "issue_date" AND length("costing_logical_sha256") = 64 AND length("logical_sha256") = 64
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_values_check" CHECK (
  "quantity" > 0 AND ("captured_cost" IS NULL OR "captured_cost" >= 0)
  AND ("suggested_price" IS NULL OR "suggested_price" >= 0) AND ("quoted_price" IS NULL OR "quoted_price" >= 0)
  AND (("price_status" = 'CONFIRMED' AND "captured_cost" IS NOT NULL AND "suggested_price" IS NOT NULL AND "quoted_price" IS NOT NULL)
    OR ("price_status" = 'PENDING' AND "captured_cost" IS NULL AND "suggested_price" IS NULL AND "quoted_price" IS NULL))
  AND (("source_kind" = 'COSTING' AND "costing_line_ref" IS NOT NULL AND "reason" IS NULL)
    OR ("source_kind" = 'MANUAL' AND "costing_line_ref" IS NULL AND "reason" IS NOT NULL))
);

CREATE UNIQUE INDEX "quote_proposals_one_accepted_per_case_key"
ON "quote_proposals"("tenant_id", "pipeline_case_id") WHERE "state" = 'ACCEPTED';

CREATE OR REPLACE FUNCTION quote_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'QUOTE_APPEND_ONLY';
END $$;

CREATE TRIGGER quote_proposal_revisions_append_only BEFORE UPDATE OR DELETE ON "quote_proposal_revisions"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();
CREATE TRIGGER quote_lines_append_only BEFORE UPDATE OR DELETE ON "quote_lines"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();
CREATE TRIGGER quote_issues_append_only BEFORE UPDATE OR DELETE ON "quote_issues"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();
CREATE TRIGGER quote_dispatches_append_only BEFORE UPDATE OR DELETE ON "quote_dispatches"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();
CREATE TRIGGER quote_client_decisions_append_only BEFORE UPDATE OR DELETE ON "quote_client_decisions"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();
CREATE TRIGGER quote_mutation_commands_append_only BEFORE UPDATE OR DELETE ON "quote_mutation_commands"
FOR EACH ROW EXECUTE FUNCTION quote_append_only_guard();

CREATE OR REPLACE FUNCTION quote_proposal_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."tenant_id" <> NEW."tenant_id" OR OLD."quote_id" <> NEW."quote_id"
    OR OLD."pipeline_case_id" <> NEW."pipeline_case_id" OR OLD."position" <> NEW."position"
    OR OLD."reference" <> NEW."reference" OR OLD."proposal_ref" <> NEW."proposal_ref"
    OR NEW."current_revision" < OLD."current_revision" THEN
    RAISE EXCEPTION 'QUOTE_PROPOSAL_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_proposals_state_only BEFORE UPDATE ON "quote_proposals"
FOR EACH ROW EXECUTE FUNCTION quote_proposal_state_guard();

CREATE OR REPLACE FUNCTION quote_revision_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "quote_proposals" p
    JOIN "costing_revisions" c ON c."tenant_id" = NEW."tenant_id" AND c."id" = NEW."costing_revision_id"
    WHERE p."tenant_id" = NEW."tenant_id" AND p."id" = NEW."proposal_id"
      AND p."pipeline_case_id" = c."pipeline_case_id" AND c."status" = 'PUBLISHED'
  ) THEN RAISE EXCEPTION 'QUOTE_COSTING_CASE_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER quote_proposal_revisions_case_guard BEFORE INSERT ON "quote_proposal_revisions"
FOR EACH ROW EXECUTE FUNCTION quote_revision_case_guard();

-- CreateIndex
CREATE INDEX "quote_proposals_case_state_idx" ON "quote_proposals"("tenant_id", "pipeline_case_id", "state", "position");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposals_tenant_id_key" ON "quote_proposals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposals_tenant_ref_key" ON "quote_proposals"("tenant_id", "proposal_ref");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposals_tenant_reference_key" ON "quote_proposals"("tenant_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposals_position_key" ON "quote_proposals"("tenant_id", "quote_id", "position");

-- CreateIndex
CREATE INDEX "quote_proposal_revisions_current_idx" ON "quote_proposal_revisions"("tenant_id", "proposal_id", "state", "revision" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposal_revisions_tenant_id_key" ON "quote_proposal_revisions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposal_revisions_tenant_ref_key" ON "quote_proposal_revisions"("tenant_id", "revision_ref");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposal_revisions_version_key" ON "quote_proposal_revisions"("tenant_id", "proposal_id", "revision");

-- CreateIndex
CREATE INDEX "quote_lines_revision_source_idx" ON "quote_lines"("tenant_id", "revision_id", "source_kind", "economic_class");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_tenant_id_key" ON "quote_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_tenant_ref_key" ON "quote_lines"("tenant_id", "line_ref");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_position_key" ON "quote_lines"("tenant_id", "revision_id", "position");

-- CreateIndex
CREATE INDEX "quote_issues_revision_idx" ON "quote_issues"("tenant_id", "revision_id", "severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_issues_tenant_ref_key" ON "quote_issues"("tenant_id", "issue_ref");

-- CreateIndex
CREATE INDEX "quote_dispatches_revision_idx" ON "quote_dispatches"("tenant_id", "revision_id", "sent_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_dispatches_tenant_ref_key" ON "quote_dispatches"("tenant_id", "dispatch_ref");

-- CreateIndex
CREATE INDEX "quote_client_decisions_proposal_idx" ON "quote_client_decisions"("tenant_id", "proposal_id", "decided_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_client_decisions_tenant_ref_key" ON "quote_client_decisions"("tenant_id", "decision_ref");

-- CreateIndex
CREATE UNIQUE INDEX "quote_client_decisions_once_key" ON "quote_client_decisions"("tenant_id", "proposal_id", "revision_id");

-- CreateIndex
CREATE INDEX "quote_commands_quote_idx" ON "quote_mutation_commands"("tenant_id", "quote_id", "operation", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_commands_tenant_request_key" ON "quote_mutation_commands"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "osi_pipeline_case_quotes_tenant_id_caseId_version_idx" ON "osi_pipeline_case_quotes"("tenant_id", "caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "osi_pipeline_case_quotes_tenant_id_key" ON "osi_pipeline_case_quotes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "osi_pipeline_case_quotes_tenant_ref_key" ON "osi_pipeline_case_quotes"("tenant_id", "public_ref");

-- CreateIndex
CREATE UNIQUE INDEX "osi_pipeline_case_quotes_case_cycle_key" ON "osi_pipeline_case_quotes"("tenant_id", "caseId", "cycle_number");

-- AddForeignKey
ALTER TABLE "osi_pipeline_case_quotes" ADD CONSTRAINT "osi_pipeline_case_quotes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi_pipeline_case_quotes" ADD CONSTRAINT "osi_pipeline_case_quotes_tenant_case_fkey" FOREIGN KEY ("tenant_id", "caseId") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osi_pipeline_case_quotes" ADD CONSTRAINT "osi_pipeline_case_quotes_costing_revision_fkey" FOREIGN KEY ("tenant_id", "costing_revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_quote_fkey" FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "osi_pipeline_case_quotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_proposal_fkey" FOREIGN KEY ("tenant_id", "proposal_id") REFERENCES "quote_proposals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_costing_fkey" FOREIGN KEY ("tenant_id", "costing_revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_supersedes_fkey" FOREIGN KEY ("tenant_id", "supersedes_revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposal_revisions" ADD CONSTRAINT "quote_proposal_revisions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_issues" ADD CONSTRAINT "quote_issues_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_issues" ADD CONSTRAINT "quote_issues_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_dispatches" ADD CONSTRAINT "quote_dispatches_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_dispatches" ADD CONSTRAINT "quote_dispatches_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_dispatches" ADD CONSTRAINT "quote_dispatches_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_client_decisions" ADD CONSTRAINT "quote_client_decisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_client_decisions" ADD CONSTRAINT "quote_client_decisions_proposal_fkey" FOREIGN KEY ("tenant_id", "proposal_id") REFERENCES "quote_proposals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_client_decisions" ADD CONSTRAINT "quote_client_decisions_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_client_decisions" ADD CONSTRAINT "quote_client_decisions_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_mutation_commands" ADD CONSTRAINT "quote_mutation_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_mutation_commands" ADD CONSTRAINT "quote_mutation_commands_quote_fkey" FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "osi_pipeline_case_quotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_mutation_commands" ADD CONSTRAINT "quote_mutation_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_reference_counters" ADD CONSTRAINT "quote_reference_counters_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
