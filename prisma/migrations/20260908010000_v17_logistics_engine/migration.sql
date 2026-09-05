-- CreateEnum
CREATE TYPE "LogisticsRuleFamily" AS ENUM ('LABOR', 'TIME', 'TRANSPORT', 'MATERIAL', 'ASSET', 'EXTERNAL', 'PER_DIEM', 'LODGING', 'TOLL', 'PARKING', 'PERMIT', 'ZONE', 'CRATING');

-- CreateEnum
CREATE TYPE "LogisticsRuleState" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LogisticsCalculationStatus" AS ENUM ('VALID', 'CONFLICT');

-- CreateEnum
CREATE TYPE "LogisticsPlanStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "LogisticsPlanRevisionStatus" AS ENUM ('PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LogisticsPlanItemFamily" AS ENUM ('LABOR', 'TIME', 'TRANSPORT', 'MATERIAL', 'ASSET', 'EXTERNAL', 'TRAVEL', 'PERMIT', 'CRATING');

-- CreateEnum
CREATE TYPE "LogisticsAvailabilityStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'PENDING_CONFIRMATION', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LogisticsPriceStatus" AS ENUM ('CONFIRMED', 'REFERENCED', 'PENDING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LogisticsSource" AS ENUM ('SURVEY', 'SERVICE', 'ROUTE', 'ADMIN_RULE', 'INVENTORY', 'ASSET', 'VEHICLE', 'PROVIDER', 'CRATING');

-- CreateEnum
CREATE TYPE "LogisticsIssueSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKER');

-- CreateEnum
CREATE TYPE "LogisticsIssueStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "logistics_rules" (
    "id" TEXT NOT NULL,
    "rule_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "series_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "family" "LogisticsRuleFamily" NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "specificity" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB NOT NULL,
    "condition_hash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "state" "LogisticsRuleState" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "replaces_rule_id" TEXT,
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_calculations" (
    "id" TEXT NOT NULL,
    "calculation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "route_version" INTEGER NOT NULL,
    "service_selection_ref" UUID NOT NULL,
    "service_revision" INTEGER NOT NULL,
    "survey_publication_ref" UUID,
    "survey_logical_sha256" CHAR(64),
    "material_requirement_ref" UUID,
    "material_logical_sha256" CHAR(64),
    "availability_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "interval_start" TIMESTAMPTZ(6) NOT NULL,
    "interval_end" TIMESTAMPTZ(6) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "rules_snapshot" JSONB NOT NULL,
    "result_snapshot" JSONB NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "result_hash" CHAR(64) NOT NULL,
    "status" "LogisticsCalculationStatus" NOT NULL DEFAULT 'VALID',
    "request_id" VARCHAR(191) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_plans" (
    "id" TEXT NOT NULL,
    "plan_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "status" "LogisticsPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_plan_revisions" (
    "id" TEXT NOT NULL,
    "revision_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "calculation_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "LogisticsPlanRevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "input_snapshot" JSONB NOT NULL,
    "rules_snapshot" JSONB NOT NULL,
    "result_snapshot" JSONB NOT NULL,
    "logical_sha256" CHAR(64) NOT NULL,
    "published_by_membership_id" TEXT NOT NULL,
    "published_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_plan_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_plan_items" (
    "id" TEXT NOT NULL,
    "item_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "family" "LogisticsPlanItemFamily" NOT NULL,
    "kind" VARCHAR(80) NOT NULL,
    "label" VARCHAR(240) NOT NULL,
    "quantity" DECIMAL(18,4),
    "unit" VARCHAR(32),
    "estimated_hours" DECIMAL(12,3),
    "trips" INTEGER,
    "required_quantity" DECIMAL(18,4),
    "available_quantity" DECIMAL(18,4),
    "reserved_quantity" DECIMAL(18,4),
    "shortage_quantity" DECIMAL(18,4),
    "availability" "LogisticsAvailabilityStatus",
    "price_status" "LogisticsPriceStatus",
    "source" "LogisticsSource" NOT NULL,
    "source_ref" UUID,
    "source_version" INTEGER,
    "snapshot" JSONB NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "logistics_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_plan_issues" (
    "id" TEXT NOT NULL,
    "issue_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "severity" "LogisticsIssueSeverity" NOT NULL,
    "family" "LogisticsPlanItemFamily",
    "message" VARCHAR(500) NOT NULL,
    "source" "LogisticsSource" NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "status" "LogisticsIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_reason" VARCHAR(1000),
    "resolved_by_membership_id" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "logistics_plan_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_plan_overrides" (
    "id" TEXT NOT NULL,
    "override_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "suggested_value" JSONB NOT NULL,
    "final_value" JSONB NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_plan_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_mutation_commands" (
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

    CONSTRAINT "logistics_mutation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logistics_rules_resolve_idx" ON "logistics_rules"("tenant_id", "family", "state", "priority", "specificity", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_rules_tenant_id_key" ON "logistics_rules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_rules_tenant_ref_key" ON "logistics_rules"("tenant_id", "rule_ref");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_rules_series_version_key" ON "logistics_rules"("tenant_id", "series_ref", "version");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_rules_replaces_key" ON "logistics_rules"("tenant_id", "replaces_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_rules_request_key" ON "logistics_rules"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "logistics_calculations_case_idx" ON "logistics_calculations"("tenant_id", "pipeline_case_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_calculations_tenant_id_key" ON "logistics_calculations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_calculations_tenant_ref_key" ON "logistics_calculations"("tenant_id", "calculation_ref");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_calculations_request_key" ON "logistics_calculations"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_plans_tenant_id_key" ON "logistics_plans"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_plans_tenant_ref_key" ON "logistics_plans"("tenant_id", "plan_ref");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_plans_case_key" ON "logistics_plans"("tenant_id", "pipeline_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_plan_revisions_calculation_id_key" ON "logistics_plan_revisions"("calculation_id");

-- CreateIndex
CREATE INDEX "logistics_revisions_current_idx" ON "logistics_plan_revisions"("tenant_id", "plan_id", "status", "revision" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_revisions_tenant_id_key" ON "logistics_plan_revisions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_revisions_tenant_ref_key" ON "logistics_plan_revisions"("tenant_id", "revision_ref");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_revisions_plan_revision_key" ON "logistics_plan_revisions"("tenant_id", "plan_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_revisions_calculation_tenant_key" ON "logistics_plan_revisions"("tenant_id", "calculation_id");

-- CreateIndex
CREATE INDEX "logistics_items_family_idx" ON "logistics_plan_items"("tenant_id", "revision_id", "family");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_items_tenant_id_key" ON "logistics_plan_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_items_tenant_ref_key" ON "logistics_plan_items"("tenant_id", "item_ref");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_items_position_key" ON "logistics_plan_items"("tenant_id", "revision_id", "position");

-- CreateIndex
CREATE INDEX "logistics_issues_revision_idx" ON "logistics_plan_issues"("tenant_id", "revision_id", "severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_issues_tenant_ref_key" ON "logistics_plan_issues"("tenant_id", "issue_ref");

-- CreateIndex
CREATE INDEX "logistics_overrides_item_idx" ON "logistics_plan_overrides"("tenant_id", "revision_id", "item_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_overrides_tenant_ref_key" ON "logistics_plan_overrides"("tenant_id", "override_ref");

-- CreateIndex
CREATE INDEX "logistics_commands_target_idx" ON "logistics_mutation_commands"("tenant_id", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_commands_tenant_request_key" ON "logistics_mutation_commands"("tenant_id", "request_id");

-- AddForeignKey
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_rule_id") REFERENCES "logistics_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_calculations" ADD CONSTRAINT "logistics_calculations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_calculations" ADD CONSTRAINT "logistics_calculations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_calculations" ADD CONSTRAINT "logistics_calculations_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plans" ADD CONSTRAINT "logistics_plans_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plans" ADD CONSTRAINT "logistics_plans_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_revisions" ADD CONSTRAINT "logistics_revisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_revisions" ADD CONSTRAINT "logistics_revisions_plan_fkey" FOREIGN KEY ("tenant_id", "plan_id") REFERENCES "logistics_plans"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_revisions" ADD CONSTRAINT "logistics_revisions_calculation_fkey" FOREIGN KEY ("tenant_id", "calculation_id") REFERENCES "logistics_calculations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_revisions" ADD CONSTRAINT "logistics_revisions_actor_fkey" FOREIGN KEY ("tenant_id", "published_by_membership_id", "published_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_items" ADD CONSTRAINT "logistics_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_items" ADD CONSTRAINT "logistics_items_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_issues" ADD CONSTRAINT "logistics_issues_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_issues" ADD CONSTRAINT "logistics_issues_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_issues" ADD CONSTRAINT "logistics_issues_resolver_fkey" FOREIGN KEY ("tenant_id", "resolved_by_membership_id", "resolved_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_overrides" ADD CONSTRAINT "logistics_overrides_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_overrides" ADD CONSTRAINT "logistics_overrides_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "logistics_plan_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_overrides" ADD CONSTRAINT "logistics_overrides_item_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "logistics_plan_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_plan_overrides" ADD CONSTRAINT "logistics_overrides_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_mutation_commands" ADD CONSTRAINT "logistics_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_mutation_commands" ADD CONSTRAINT "logistics_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks and deterministic rule resolution.
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_priority_check" CHECK ("priority" >= 0 AND "specificity" >= 0 AND "version" > 0);
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from");
ALTER TABLE "logistics_calculations" ADD CONSTRAINT "logistics_calculations_interval_check" CHECK ("interval_end" > "interval_start" AND "route_version" > 0 AND "service_revision" > 0);
ALTER TABLE "logistics_plan_revisions" ADD CONSTRAINT "logistics_revisions_revision_check" CHECK ("revision" > 0);
ALTER TABLE "logistics_plan_items" ADD CONSTRAINT "logistics_items_values_check" CHECK (
  ("quantity" IS NULL OR "quantity" >= 0) AND
  ("estimated_hours" IS NULL OR "estimated_hours" >= 0) AND
  ("trips" IS NULL OR "trips" >= 0) AND
  ("required_quantity" IS NULL OR "required_quantity" >= 0) AND
  ("available_quantity" IS NULL OR "available_quantity" >= 0) AND
  ("reserved_quantity" IS NULL OR "reserved_quantity" >= 0) AND
  ("shortage_quantity" IS NULL OR "shortage_quantity" >= 0)
);
ALTER TABLE "logistics_plan_issues" ADD CONSTRAINT "logistics_issues_resolution_check" CHECK (
  ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_membership_id" IS NULL AND "resolved_by_user_id" IS NULL AND "resolved_reason" IS NULL)
  OR
  ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolved_by_membership_id" IS NOT NULL AND "resolved_by_user_id" IS NOT NULL AND "resolved_reason" IS NOT NULL)
);

-- Equal-priority/equal-specificity active rules with the same canonical predicate are a configuration error.
ALTER TABLE "logistics_rules" ADD CONSTRAINT "logistics_rules_no_equal_conflict" EXCLUDE USING gist (
  "tenant_id" WITH =,
  "family" WITH =,
  "priority" WITH =,
  "specificity" WITH =,
  "condition_hash" WITH =,
  tstzrange(COALESCE("valid_from", '-infinity'::timestamptz), COALESCE("valid_to", 'infinity'::timestamptz), '[)') WITH &&
) WHERE ("state" = 'ACTIVE');

CREATE OR REPLACE FUNCTION logistics_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LOGISTICS_APPEND_ONLY' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION logistics_assert_rule_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."rule_ref" IS DISTINCT FROM OLD."rule_ref"
     OR NEW."series_ref" IS DISTINCT FROM OLD."series_ref" OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."family" IS DISTINCT FROM OLD."family" OR NEW."conditions" IS DISTINCT FROM OLD."conditions"
     OR NEW."result" IS DISTINCT FROM OLD."result" OR NEW."condition_hash" IS DISTINCT FROM OLD."condition_hash" THEN
    RAISE EXCEPTION 'LOGISTICS_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION logistics_assert_plan_identity_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."plan_ref" IS DISTINCT FROM OLD."plan_ref"
     OR NEW."pipeline_case_id" IS DISTINCT FROM OLD."pipeline_case_id" THEN
    RAISE EXCEPTION 'LOGISTICS_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION logistics_assert_issue_resolution_only() RETURNS trigger AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" OR NEW."issue_ref" IS DISTINCT FROM OLD."issue_ref"
     OR NEW."revision_id" IS DISTINCT FROM OLD."revision_id" OR NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."severity" IS DISTINCT FROM OLD."severity" OR NEW."family" IS DISTINCT FROM OLD."family"
     OR NEW."message" IS DISTINCT FROM OLD."message" OR NEW."source" IS DISTINCT FROM OLD."source"
     OR NEW."source_snapshot" IS DISTINCT FROM OLD."source_snapshot" OR OLD."status" <> 'OPEN' OR NEW."status" <> 'RESOLVED'
     OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'LOGISTICS_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER logistics_calculations_append_only BEFORE UPDATE OR DELETE ON "logistics_calculations" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_revisions_append_only BEFORE UPDATE OR DELETE ON "logistics_plan_revisions" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_items_append_only BEFORE UPDATE OR DELETE ON "logistics_plan_items" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_overrides_append_only BEFORE UPDATE OR DELETE ON "logistics_plan_overrides" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_commands_append_only BEFORE UPDATE OR DELETE ON "logistics_mutation_commands" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_rules_no_delete BEFORE DELETE ON "logistics_rules" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_plans_no_delete BEFORE DELETE ON "logistics_plans" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();
CREATE TRIGGER logistics_issues_no_delete BEFORE DELETE ON "logistics_plan_issues" FOR EACH ROW EXECUTE FUNCTION logistics_reject_mutation();

CREATE TRIGGER logistics_rules_identity_immutable BEFORE UPDATE ON "logistics_rules" FOR EACH ROW EXECUTE FUNCTION logistics_assert_rule_identity_immutable();
CREATE TRIGGER logistics_plans_identity_immutable BEFORE UPDATE ON "logistics_plans" FOR EACH ROW EXECUTE FUNCTION logistics_assert_plan_identity_immutable();
CREATE TRIGGER logistics_issues_resolution_only BEFORE UPDATE ON "logistics_plan_issues" FOR EACH ROW EXECUTE FUNCTION logistics_assert_issue_resolution_only();
