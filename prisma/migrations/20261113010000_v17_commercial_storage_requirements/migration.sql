BEGIN;

CREATE TYPE "osi"."StorageRequirementSource" AS ENUM (
  'CLIENT_DECLARED',
  'COMMERCIAL_ESTIMATE',
  'SURVEY_VERIFIED',
  'WAREHOUSE_CONFIRMED'
);

CREATE TYPE "osi"."StorageVisitDecision" AS ENUM (
  'TO_CONFIRM',
  'REQUIRED',
  'NOT_REQUIRED'
);

CREATE TABLE "osi"."customer_storage_requirement_revisions" (
  "id" TEXT NOT NULL,
  "requirement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "service_revision_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "storage_type" "osi"."CustomerStorageType" NOT NULL,
  "capacity_basis" "osi"."StorageCapacityBasis" NOT NULL,
  "capacity_quantity" DECIMAL(12,3) NOT NULL,
  "estimated_duration_months" INTEGER NOT NULL,
  "planned_entry_date" DATE,
  "data_source" "osi"."StorageRequirementSource" NOT NULL,
  "visit_decision" "osi"."StorageVisitDecision" NOT NULL,
  "notes" VARCHAR(2000),
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_storage_requirement_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_storage_requirements_capacity_check" CHECK ("capacity_quantity" > 0),
  CONSTRAINT "customer_storage_requirements_duration_check" CHECK ("estimated_duration_months" BETWEEN 1 AND 600)
);

CREATE UNIQUE INDEX "customer_storage_requirements_tenant_ref_key"
  ON "osi"."customer_storage_requirement_revisions"("tenant_id", "requirement_ref");
CREATE UNIQUE INDEX "customer_storage_requirements_case_revision_key"
  ON "osi"."customer_storage_requirement_revisions"("tenant_id", "pipeline_case_id", "revision");
CREATE INDEX "customer_storage_requirements_case_created_idx"
  ON "osi"."customer_storage_requirement_revisions"("tenant_id", "pipeline_case_id", "created_at" DESC);

ALTER TABLE "osi"."customer_storage_requirement_revisions"
  ADD CONSTRAINT "customer_storage_requirements_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_requirements_case_fkey"
  FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_requirements_service_revision_fkey"
  FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "osi"."pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_requirements_actor_fkey"
  FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
