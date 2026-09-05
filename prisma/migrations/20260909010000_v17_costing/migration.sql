-- CreateEnum
CREATE TYPE "CostingFamily" AS ENUM ('LABOR', 'TRANSPORT', 'MATERIAL', 'CRATING', 'ASSET', 'TRAVEL', 'THIRD_PARTY', 'FREIGHT', 'CUSTOMS', 'PERMIT', 'ADDITIONAL', 'RISK', 'CURRENCY_COMPENSATION');

-- CreateEnum
CREATE TYPE "CostingSource" AS ENUM ('SURVEY', 'SERVICE', 'COMBO', 'ADMIN', 'MOTOR', 'PROVIDER', 'MATERIAL_COST', 'ASSET_COST', 'VEHICLE_COST', 'EXCHANGE_RATE');

-- CreateEnum
CREATE TYPE "CostingEconomicClass" AS ENUM ('PR', 'EX', 'DE');

-- CreateEnum
CREATE TYPE "CostingRuleState" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CostingCalculationStatus" AS ENUM ('VALID', 'CONFLICT');

-- CreateEnum
CREATE TYPE "CostingRevisionStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CostingIssueSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKER');

-- CreateEnum
CREATE TYPE "CostingIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CostingPriceStatus" AS ENUM ('RECOMMENDED', 'BELOW_RECOMMENDED', 'BELOW_MINIMUM', 'ABOVE_RECOMMENDED', 'NO_MARGIN');

-- CreateEnum
CREATE TYPE "CostingOverrideKind" AS ENUM ('COST', 'EXCHANGE_RATE', 'MARGIN', 'SUGGESTED_PRICE', 'CLASSIFICATION');

-- CreateEnum
CREATE TYPE "CostingOverrideStatus" AS ENUM ('APPLIED', 'AUTHORIZATION_REQUIRED', 'AUTHORIZED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CostingAuthorizationDecision" AS ENUM ('AUTHORIZED', 'REJECTED');

-- CreateTable
CREATE TABLE "costing_rules" (
    "id" TEXT NOT NULL,
    "rule_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "family" "CostingFamily" NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "classification" "CostingEconomicClass" NOT NULL,
    "source" "CostingSource" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "specificity" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "condition_hash" CHAR(64) NOT NULL,
    "unit_cost" DECIMAL(18,6),
    "currency" CHAR(3) NOT NULL,
    "minimum_margin_bps" INTEGER,
    "recommended_margin_bps" INTEGER,
    "result" JSONB NOT NULL,
    "state" "CostingRuleState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "replaces_rule_id" TEXT,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_exchange_rates" (
    "id" TEXT NOT NULL,
    "rate_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(24,10) NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "state" "CostingRuleState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "replaces_rate_id" TEXT,
    "logical_sha256" CHAR(64) NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_calculations" (
    "id" TEXT NOT NULL,
    "calculation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "logistics_revision_id" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "rules_snapshot" JSONB NOT NULL,
    "rates_snapshot" JSONB NOT NULL,
    "result_snapshot" JSONB NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "result_hash" CHAR(64) NOT NULL,
    "status" "CostingCalculationStatus" NOT NULL DEFAULT 'VALID',
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_revisions" (
    "id" TEXT NOT NULL,
    "revision_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "logistics_revision_id" TEXT NOT NULL,
    "calculation_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "CostingRevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "base_currency" CHAR(3) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "rules_snapshot" JSONB NOT NULL,
    "rates_snapshot" JSONB NOT NULL,
    "totals_snapshot" JSONB NOT NULL,
    "logical_sha256" CHAR(64) NOT NULL,
    "published_by_membership_id" TEXT NOT NULL,
    "published_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_lines" (
    "id" TEXT NOT NULL,
    "line_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "logistics_item_ref" UUID,
    "family" "CostingFamily" NOT NULL,
    "concept" VARCHAR(240) NOT NULL,
    "classification" "CostingEconomicClass" NOT NULL,
    "source" "CostingSource" NOT NULL,
    "source_ref" UUID,
    "source_version" INTEGER,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "original_currency" CHAR(3) NOT NULL,
    "original_unit_cost" DECIMAL(18,6) NOT NULL,
    "exchange_rate_ref" UUID,
    "exchange_rate_version" INTEGER,
    "exchange_rate" DECIMAL(24,10) NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "base_unit_cost" DECIMAL(18,6) NOT NULL,
    "total_cost" DECIMAL(18,6) NOT NULL,
    "minimum_margin_bps" INTEGER,
    "recommended_margin_bps" INTEGER,
    "suggested_price" DECIMAL(18,6),
    "priceStatus" "CostingPriceStatus" NOT NULL DEFAULT 'NO_MARGIN',
    "snapshot" JSONB NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "costing_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_issues" (
    "id" TEXT NOT NULL,
    "issue_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "severity" "CostingIssueSeverity" NOT NULL,
    "family" "CostingFamily",
    "message" VARCHAR(500) NOT NULL,
    "source" "CostingSource" NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "status" "CostingIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_reason" VARCHAR(1000),
    "resolved_by_membership_id" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "costing_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_overrides" (
    "id" TEXT NOT NULL,
    "override_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "line_id" TEXT,
    "kind" "CostingOverrideKind" NOT NULL,
    "suggested_value" JSONB NOT NULL,
    "final_value" JSONB NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "CostingOverrideStatus" NOT NULL DEFAULT 'APPLIED',
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_margin_authorizations" (
    "id" TEXT NOT NULL,
    "authorization_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "override_id" TEXT NOT NULL,
    "decision" "CostingAuthorizationDecision" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_margin_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_mutation_commands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "target_ref" VARCHAR(191) NOT NULL,
    "result_json" JSONB NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_mutation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "costing_rules_resolve_idx" ON "costing_rules"("tenant_id", "family", "state", "priority", "specificity", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "costing_rules_tenant_id_key" ON "costing_rules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_rules_tenant_ref_key" ON "costing_rules"("tenant_id", "rule_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_rules_series_version_key" ON "costing_rules"("tenant_id", "series_ref", "version");

-- CreateIndex
CREATE UNIQUE INDEX "costing_rules_replaces_key" ON "costing_rules"("tenant_id", "replaces_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_rules_request_key" ON "costing_rules"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "costing_exchange_rates_resolve_idx" ON "costing_exchange_rates"("tenant_id", "base_currency", "quote_currency", "state", "effective_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "costing_exchange_rates_tenant_id_key" ON "costing_exchange_rates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_exchange_rates_tenant_ref_key" ON "costing_exchange_rates"("tenant_id", "rate_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_exchange_rates_series_version_key" ON "costing_exchange_rates"("tenant_id", "series_ref", "version");

-- CreateIndex
CREATE UNIQUE INDEX "costing_exchange_rates_replaces_key" ON "costing_exchange_rates"("tenant_id", "replaces_rate_id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_exchange_rates_request_key" ON "costing_exchange_rates"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "costing_calculations_case_idx" ON "costing_calculations"("tenant_id", "pipeline_case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "costing_calculations_logistics_idx" ON "costing_calculations"("tenant_id", "logistics_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_calculations_tenant_id_key" ON "costing_calculations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_calculations_tenant_ref_key" ON "costing_calculations"("tenant_id", "calculation_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_calculations_request_key" ON "costing_calculations"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_revisions_calculation_id_key" ON "costing_revisions"("calculation_id");

-- CreateIndex
CREATE INDEX "costing_revisions_current_idx" ON "costing_revisions"("tenant_id", "pipeline_case_id", "status", "revision" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "costing_revisions_tenant_id_key" ON "costing_revisions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_revisions_tenant_ref_key" ON "costing_revisions"("tenant_id", "revision_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_revisions_case_revision_key" ON "costing_revisions"("tenant_id", "pipeline_case_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "costing_revisions_calculation_tenant_key" ON "costing_revisions"("tenant_id", "calculation_id");

-- CreateIndex
CREATE INDEX "costing_lines_family_idx" ON "costing_lines"("tenant_id", "revision_id", "family", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "costing_lines_tenant_id_key" ON "costing_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_lines_tenant_ref_key" ON "costing_lines"("tenant_id", "line_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_lines_position_key" ON "costing_lines"("tenant_id", "revision_id", "position");

-- CreateIndex
CREATE INDEX "costing_issues_revision_idx" ON "costing_issues"("tenant_id", "revision_id", "severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "costing_issues_tenant_ref_key" ON "costing_issues"("tenant_id", "issue_ref");

-- CreateIndex
CREATE INDEX "costing_overrides_line_idx" ON "costing_overrides"("tenant_id", "revision_id", "line_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "costing_overrides_tenant_id_key" ON "costing_overrides"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "costing_overrides_tenant_ref_key" ON "costing_overrides"("tenant_id", "override_ref");

-- CreateIndex
CREATE INDEX "costing_margin_authorizations_created_idx" ON "costing_margin_authorizations"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "costing_margin_authorizations_tenant_ref_key" ON "costing_margin_authorizations"("tenant_id", "authorization_ref");

-- CreateIndex
CREATE UNIQUE INDEX "costing_margin_authorizations_override_key" ON "costing_margin_authorizations"("tenant_id", "override_id");

-- CreateIndex
CREATE INDEX "costing_commands_target_idx" ON "costing_mutation_commands"("tenant_id", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "costing_commands_tenant_request_key" ON "costing_mutation_commands"("tenant_id", "request_id");

-- AddForeignKey
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_rule_id") REFERENCES "costing_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_exchange_rates" ADD CONSTRAINT "costing_exchange_rates_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_exchange_rates" ADD CONSTRAINT "costing_exchange_rates_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_exchange_rates" ADD CONSTRAINT "costing_exchange_rates_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_rate_id") REFERENCES "costing_exchange_rates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_calculations" ADD CONSTRAINT "costing_calculations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_calculations" ADD CONSTRAINT "costing_calculations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_calculations" ADD CONSTRAINT "costing_calculations_logistics_revision_fkey" FOREIGN KEY ("tenant_id", "logistics_revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_calculations" ADD CONSTRAINT "costing_calculations_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_logistics_revision_fkey" FOREIGN KEY ("tenant_id", "logistics_revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_calculation_fkey" FOREIGN KEY ("tenant_id", "calculation_id") REFERENCES "costing_calculations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_actor_fkey" FOREIGN KEY ("tenant_id", "published_by_membership_id", "published_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_lines" ADD CONSTRAINT "costing_lines_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_lines" ADD CONSTRAINT "costing_lines_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_issues" ADD CONSTRAINT "costing_issues_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_issues" ADD CONSTRAINT "costing_issues_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_issues" ADD CONSTRAINT "costing_issues_resolver_fkey" FOREIGN KEY ("tenant_id", "resolved_by_membership_id", "resolved_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_overrides" ADD CONSTRAINT "costing_overrides_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_overrides" ADD CONSTRAINT "costing_overrides_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "costing_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_overrides" ADD CONSTRAINT "costing_overrides_line_fkey" FOREIGN KEY ("tenant_id", "line_id") REFERENCES "costing_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_overrides" ADD CONSTRAINT "costing_overrides_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_margin_authorizations" ADD CONSTRAINT "costing_margin_authorizations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_margin_authorizations" ADD CONSTRAINT "costing_margin_authorizations_override_fkey" FOREIGN KEY ("tenant_id", "override_id") REFERENCES "costing_overrides"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_margin_authorizations" ADD CONSTRAINT "costing_margin_authorizations_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_mutation_commands" ADD CONSTRAINT "costing_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_mutation_commands" ADD CONSTRAINT "costing_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks: economic inputs are versioned, bounded and tenant-first.
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_values_check" CHECK (
  "priority" >= 0 AND "specificity" >= 0 AND "version" > 0
  AND ("unit_cost" IS NULL OR "unit_cost" >= 0)
  AND ("minimum_margin_bps" IS NULL OR "minimum_margin_bps" BETWEEN 0 AND 9999)
  AND ("recommended_margin_bps" IS NULL OR "recommended_margin_bps" BETWEEN 0 AND 9999)
  AND ("minimum_margin_bps" IS NULL OR "recommended_margin_bps" IS NULL OR "recommended_margin_bps" >= "minimum_margin_bps")
);
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "costing_exchange_rates" ADD CONSTRAINT "costing_exchange_rates_values_check" CHECK (
  "version" > 0 AND "rate" > 0 AND "base_currency" <> "quote_currency" AND ("valid_to" IS NULL OR "valid_to" > "effective_at")
);
ALTER TABLE "costing_revisions" ADD CONSTRAINT "costing_revisions_revision_check" CHECK ("revision" > 0);
ALTER TABLE "costing_lines" ADD CONSTRAINT "costing_lines_values_check" CHECK (
  "quantity" >= 0 AND "original_unit_cost" >= 0 AND "exchange_rate" > 0 AND "base_unit_cost" >= 0 AND "total_cost" >= 0
  AND ("minimum_margin_bps" IS NULL OR "minimum_margin_bps" BETWEEN 0 AND 9999)
  AND ("recommended_margin_bps" IS NULL OR "recommended_margin_bps" BETWEEN 0 AND 9999)
  AND ("suggested_price" IS NULL OR "suggested_price" >= 0)
);
ALTER TABLE "costing_issues" ADD CONSTRAINT "costing_issues_resolution_check" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_membership_id" IS NULL AND "resolved_by_user_id" IS NULL AND "resolved_reason" IS NULL)
  OR
  ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_membership_id" IS NOT NULL AND "resolved_by_user_id" IS NOT NULL AND "resolved_reason" IS NOT NULL)
);

-- Identical active predicates cannot overlap at the same resolution precedence.
ALTER TABLE "costing_rules" ADD CONSTRAINT "costing_rules_no_equal_conflict" EXCLUDE USING gist (
  "tenant_id" WITH =,
  "family" WITH =,
  "priority" WITH =,
  "specificity" WITH =,
  "condition_hash" WITH =,
  tstzrange(COALESCE("valid_from", '-infinity'::timestamptz), COALESCE("valid_to", 'infinity'::timestamptz), '[)') WITH &&
) WHERE ("state" = 'ACTIVE');

ALTER TABLE "costing_exchange_rates" ADD CONSTRAINT "costing_exchange_rates_no_overlap" EXCLUDE USING gist (
  "tenant_id" WITH =,
  "base_currency" WITH =,
  "quote_currency" WITH =,
  tstzrange("effective_at", COALESCE("valid_to", 'infinity'::timestamptz), '[)') WITH &&
) WHERE ("state" = 'ACTIVE');

CREATE OR REPLACE FUNCTION costing_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'COSTING_APPEND_ONLY' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION costing_assert_rule_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."rule_ref" IS DISTINCT FROM OLD."rule_ref"
     OR NEW."series_ref" IS DISTINCT FROM OLD."series_ref" OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."family" IS DISTINCT FROM OLD."family" OR NEW."classification" IS DISTINCT FROM OLD."classification"
     OR NEW."source" IS DISTINCT FROM OLD."source" OR NEW."conditions" IS DISTINCT FROM OLD."conditions"
     OR NEW."condition_hash" IS DISTINCT FROM OLD."condition_hash" OR NEW."unit_cost" IS DISTINCT FROM OLD."unit_cost"
     OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."minimum_margin_bps" IS DISTINCT FROM OLD."minimum_margin_bps"
     OR NEW."recommended_margin_bps" IS DISTINCT FROM OLD."recommended_margin_bps" OR NEW."result" IS DISTINCT FROM OLD."result" THEN
    RAISE EXCEPTION 'COSTING_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION costing_assert_rate_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."rate_ref" IS DISTINCT FROM OLD."rate_ref"
     OR NEW."series_ref" IS DISTINCT FROM OLD."series_ref" OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."base_currency" IS DISTINCT FROM OLD."base_currency" OR NEW."quote_currency" IS DISTINCT FROM OLD."quote_currency"
     OR NEW."rate" IS DISTINCT FROM OLD."rate" OR NEW."effective_at" IS DISTINCT FROM OLD."effective_at"
     OR NEW."logical_sha256" IS DISTINCT FROM OLD."logical_sha256" THEN
    RAISE EXCEPTION 'COSTING_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION costing_assert_issue_resolution_only() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."issue_ref" IS DISTINCT FROM OLD."issue_ref"
     OR NEW."revision_id" IS DISTINCT FROM OLD."revision_id" OR NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."severity" IS DISTINCT FROM OLD."severity" OR NEW."family" IS DISTINCT FROM OLD."family"
     OR NEW."message" IS DISTINCT FROM OLD."message" OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."source_snapshot" IS DISTINCT FROM OLD."source_snapshot" OR OLD."status" <> 'OPEN' OR NEW."status" <> 'RESOLVED'
     OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'COSTING_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER costing_calculations_append_only BEFORE UPDATE OR DELETE ON "costing_calculations" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_revisions_append_only BEFORE UPDATE OR DELETE ON "costing_revisions" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_lines_append_only BEFORE UPDATE OR DELETE ON "costing_lines" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_overrides_append_only BEFORE UPDATE OR DELETE ON "costing_overrides" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_margin_authorizations_append_only BEFORE UPDATE OR DELETE ON "costing_margin_authorizations" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_commands_append_only BEFORE UPDATE OR DELETE ON "costing_mutation_commands" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_rules_no_delete BEFORE DELETE ON "costing_rules" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_exchange_rates_no_delete BEFORE DELETE ON "costing_exchange_rates" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();
CREATE TRIGGER costing_issues_no_delete BEFORE DELETE ON "costing_issues" FOR EACH ROW EXECUTE FUNCTION costing_reject_mutation();

CREATE TRIGGER costing_rules_identity_immutable BEFORE UPDATE ON "costing_rules" FOR EACH ROW EXECUTE FUNCTION costing_assert_rule_identity_immutable();
CREATE TRIGGER costing_exchange_rates_identity_immutable BEFORE UPDATE ON "costing_exchange_rates" FOR EACH ROW EXECUTE FUNCTION costing_assert_rate_identity_immutable();
CREATE TRIGGER costing_issues_resolution_only BEFORE UPDATE ON "costing_issues" FOR EACH ROW EXECUTE FUNCTION costing_assert_issue_resolution_only();
