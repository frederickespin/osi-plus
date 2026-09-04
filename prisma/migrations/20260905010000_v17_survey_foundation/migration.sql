SET search_path = osi, public;

-- CreateEnum
CREATE TYPE "SurveyCatalogVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SurveyAssignmentStatus" AS ENUM ('ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurveyDraftStatus" AS ENUM ('IN_PROGRESS', 'READY_FOR_REVIEW', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurveyPublicationStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SurveyShipmentMode" AS ENUM ('SEA', 'AIR', 'ROAD', 'LOCAL', 'STORAGE');

-- CreateEnum
CREATE TYPE "SurveyItemCondition" AS ENUM ('GOOD', 'USED', 'DAMAGED', 'PRE_EXISTING_DAMAGE');

-- CreateEnum
CREATE TYPE "SurveyItemFlag" AS ENUM ('CRATING_CANDIDATE', 'FRAGILE', 'ASSEMBLE', 'DISASSEMBLE', 'CRANE_CANDIDATE', 'VALUABLE', 'OVERSIZED');

-- CreateEnum
CREATE TYPE "SurveyMeasurementUnit" AS ENUM ('CM', 'IN');

-- CreateEnum
CREATE TYPE "SurveyMetricSource" AS ENUM ('CATALOG', 'MEASURED', 'DENSITY');

-- CreateEnum
CREATE TYPE "SurveyAccessSide" AS ENUM ('ORIGIN', 'DESTINATION');

-- CreateEnum
CREATE TYPE "SurveyAccessFlag" AS ENUM ('STAIRS', 'PASSENGER_ELEVATOR', 'FREIGHT_ELEVATOR', 'ITEM_DOES_NOT_FIT_ELEVATOR', 'NARROW_PASSAGE', 'LONG_CARRY', 'RESTRICTED_PARKING', 'LOADING_DOCK', 'RESTRICTED_HOURS', 'PERMIT_REQUIRED', 'CRANE_OR_HOIST', 'TRANSSHIPMENT');

-- CreateEnum
CREATE TYPE "SurveyConditionKind" AS ENUM ('FACILITY', 'INCONVENIENCE');

-- CreateEnum
CREATE TYPE "SurveyPhotoPurpose" AS ENUM ('ITEM', 'DAMAGE', 'ORIGIN_ACCESS', 'DESTINATION_ACCESS', 'SPECIAL_CONDITION', 'GENERAL');

-- CreateEnum
CREATE TYPE "SurveyBlobStatus" AS ENUM ('ACTIVE', 'QUARANTINED', 'RETIRED');

-- CreateTable
CREATE TABLE "survey_catalog_versions" (
    "id" TEXT NOT NULL,
    "catalog_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SurveyCatalogVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_catalog_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_article_catalog_items" (
    "id" TEXT NOT NULL,
    "article_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequent_area_refs" UUID[] DEFAULT ARRAY[]::UUID[],
    "default_volume_m3" DECIMAL(12,6),
    "default_weight_kg" DECIMAL(12,3),
    "weight_source" "SurveyMetricSource",
    "status" "ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_article_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_area_catalog_items" (
    "id" TEXT NOT NULL,
    "area_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_area_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_condition_catalog_items" (
    "id" TEXT NOT NULL,
    "condition_ref" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "SurveyConditionKind" NOT NULL,
    "status" "ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_condition_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_assignments" (
    "id" TEXT NOT NULL,
    "assignment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "service_revision_id" TEXT NOT NULL,
    "route_version" INTEGER NOT NULL,
    "evaluator_membership_id" TEXT NOT NULL,
    "evaluator_user_id" TEXT NOT NULL,
    "scheduled_start" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_end" TIMESTAMPTZ(6),
    "status" "SurveyAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "arrival_at" TIMESTAMPTZ(6),
    "punctuality_confirmed_at" TIMESTAMPTZ(6),
    "context_snapshot" JSONB NOT NULL,
    "instruction_snapshot" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_membership_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_drafts" (
    "id" TEXT NOT NULL,
    "survey_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "service_revision_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "route_version" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SurveyDraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "measurement_unit_preference" "SurveyMeasurementUnit" NOT NULL DEFAULT 'CM',
    "notes" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_draft_items" (
    "id" TEXT NOT NULL,
    "item_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "catalog_version_id" TEXT NOT NULL,
    "catalog_item_id" TEXT NOT NULL,
    "area_catalog_item_id" TEXT NOT NULL,
    "article_ref_snapshot" UUID NOT NULL,
    "article_code_snapshot" VARCHAR(64) NOT NULL,
    "article_name_snapshot" VARCHAR(160) NOT NULL,
    "area_ref_snapshot" UUID NOT NULL,
    "area_code_snapshot" VARCHAR(64) NOT NULL,
    "area_name_snapshot" VARCHAR(120) NOT NULL,
    "shipment_mode" "SurveyShipmentMode" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "SurveyItemCondition" NOT NULL DEFAULT 'GOOD',
    "flags" "SurveyItemFlag"[] DEFAULT ARRAY[]::"SurveyItemFlag"[],
    "original_unit" "SurveyMeasurementUnit",
    "original_dimensions" JSONB,
    "length_cm" DECIMAL(12,3),
    "width_cm" DECIMAL(12,3),
    "height_cm" DECIMAL(12,3),
    "unit_volume_m3" DECIMAL(12,6),
    "unit_weight_kg" DECIMAL(12,3),
    "volume_source" "SurveyMetricSource",
    "weight_source" "SurveyMetricSource",
    "note" VARCHAR(1000),
    "sort_order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_access_observations" (
    "id" TEXT NOT NULL,
    "access_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "side" "SurveyAccessSide" NOT NULL,
    "floor_number" INTEGER,
    "stairs_floors" INTEGER,
    "elevator_available" BOOLEAN,
    "elevator_floor" INTEGER,
    "parking_distance_m" DECIMAL(12,2),
    "flags" "SurveyAccessFlag"[] DEFAULT ARRAY[]::"SurveyAccessFlag"[],
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_access_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_blob_objects" (
    "id" TEXT NOT NULL,
    "blob_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(320) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" "SurveyBlobStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_blob_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_photos" (
    "id" TEXT NOT NULL,
    "photo_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "draft_item_id" TEXT,
    "access_id" TEXT,
    "blob_object_id" TEXT NOT NULL,
    "purpose" "SurveyPhotoPurpose" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_publications" (
    "id" TEXT NOT NULL,
    "publication_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "pipeline_case_id" TEXT NOT NULL,
    "service_revision_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "SurveyPublicationStatus" NOT NULL DEFAULT 'CURRENT',
    "route_version" INTEGER NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "service_selection_ref" UUID NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "totals_snapshot" JSONB NOT NULL,
    "logical_sha256" CHAR(64) NOT NULL,
    "pdf_blob_object_id" TEXT NOT NULL,
    "pdf_sha256" CHAR(64) NOT NULL,
    "replaces_publication_id" TEXT,
    "published_by_membership_id" TEXT NOT NULL,
    "published_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_publication_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "article_ref" UUID NOT NULL,
    "article_code" VARCHAR(64) NOT NULL,
    "article_name" VARCHAR(160) NOT NULL,
    "area_ref" UUID NOT NULL,
    "area_code" VARCHAR(64) NOT NULL,
    "area_name" VARCHAR(120) NOT NULL,
    "shipment_mode" "SurveyShipmentMode" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "SurveyItemCondition" NOT NULL,
    "flags" "SurveyItemFlag"[] DEFAULT ARRAY[]::"SurveyItemFlag"[],
    "measurements" JSONB,
    "unit_volume_m3" DECIMAL(12,6),
    "unit_weight_kg" DECIMAL(12,3),
    "metric_sources" JSONB NOT NULL,
    "note" VARCHAR(1000),
    "photo_refs" UUID[] DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "survey_publication_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_publication_access" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "side" "SurveyAccessSide" NOT NULL,
    "facts_snapshot" JSONB NOT NULL,
    "photo_refs" UUID[] DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "survey_publication_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_publication_signatures" (
    "id" TEXT NOT NULL,
    "signature_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "blob_object_id" TEXT NOT NULL,
    "signer_name" VARCHAR(160) NOT NULL,
    "relationship" VARCHAR(120) NOT NULL,
    "signed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "survey_publication_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_mutation_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "request_id" VARCHAR(191) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "target_ref" VARCHAR(191) NOT NULL,
    "resulting_version" INTEGER NOT NULL,
    "actor_membership_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "result_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_mutation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "survey_catalog_versions_active_idx" ON "survey_catalog_versions"("tenant_id", "status", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_catalog_versions_tenant_id_key" ON "survey_catalog_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_catalog_versions_tenant_ref_key" ON "survey_catalog_versions"("tenant_id", "catalog_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_catalog_versions_tenant_version_key" ON "survey_catalog_versions"("tenant_id", "version");

-- CreateIndex
CREATE INDEX "survey_article_catalog_items_lookup_idx" ON "survey_article_catalog_items"("tenant_id", "catalog_version_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "survey_article_catalog_items_tenant_id_key" ON "survey_article_catalog_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_article_catalog_items_tenant_version_id_key" ON "survey_article_catalog_items"("tenant_id", "catalog_version_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_article_catalog_items_version_ref_key" ON "survey_article_catalog_items"("tenant_id", "catalog_version_id", "article_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_article_catalog_items_version_code_key" ON "survey_article_catalog_items"("tenant_id", "catalog_version_id", "code");

-- CreateIndex
CREATE INDEX "survey_area_catalog_items_lookup_idx" ON "survey_area_catalog_items"("tenant_id", "catalog_version_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "survey_area_catalog_items_tenant_id_key" ON "survey_area_catalog_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_area_catalog_items_tenant_version_id_key" ON "survey_area_catalog_items"("tenant_id", "catalog_version_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_area_catalog_items_version_ref_key" ON "survey_area_catalog_items"("tenant_id", "catalog_version_id", "area_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_area_catalog_items_version_code_key" ON "survey_area_catalog_items"("tenant_id", "catalog_version_id", "code");

-- CreateIndex
CREATE INDEX "survey_condition_catalog_items_lookup_idx" ON "survey_condition_catalog_items"("tenant_id", "catalog_version_id", "kind", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "survey_condition_catalog_items_tenant_id_key" ON "survey_condition_catalog_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_condition_catalog_items_version_ref_key" ON "survey_condition_catalog_items"("tenant_id", "catalog_version_id", "condition_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_condition_catalog_items_version_code_key" ON "survey_condition_catalog_items"("tenant_id", "catalog_version_id", "code");

-- CreateIndex
CREATE INDEX "survey_assignments_evaluator_agenda_idx" ON "survey_assignments"("tenant_id", "evaluator_membership_id", "evaluator_user_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "survey_assignments_case_idx" ON "survey_assignments"("tenant_id", "pipeline_case_id", "scheduled_start");

-- CreateIndex
CREATE UNIQUE INDEX "survey_assignments_tenant_id_key" ON "survey_assignments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_assignments_tenant_ref_key" ON "survey_assignments"("tenant_id", "assignment_ref");

-- CreateIndex
CREATE INDEX "survey_drafts_case_status_idx" ON "survey_drafts"("tenant_id", "pipeline_case_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_drafts_tenant_id_key" ON "survey_drafts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_drafts_tenant_id_catalog_version_key" ON "survey_drafts"("tenant_id", "id", "catalog_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_drafts_tenant_ref_key" ON "survey_drafts"("tenant_id", "survey_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_drafts_assignment_revision_key" ON "survey_drafts"("tenant_id", "assignment_id", "revision");

-- CreateIndex
CREATE INDEX "survey_draft_items_area_idx" ON "survey_draft_items"("tenant_id", "draft_id", "area_ref_snapshot", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "survey_draft_items_tenant_id_key" ON "survey_draft_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_draft_items_tenant_draft_id_key" ON "survey_draft_items"("tenant_id", "draft_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_draft_items_tenant_ref_key" ON "survey_draft_items"("tenant_id", "item_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_draft_items_sort_key" ON "survey_draft_items"("tenant_id", "draft_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "survey_access_observations_tenant_id_key" ON "survey_access_observations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_access_observations_tenant_draft_id_key" ON "survey_access_observations"("tenant_id", "draft_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_access_observations_tenant_ref_key" ON "survey_access_observations"("tenant_id", "access_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_access_observations_side_key" ON "survey_access_observations"("tenant_id", "draft_id", "side");

-- CreateIndex
CREATE INDEX "survey_blob_objects_status_idx" ON "survey_blob_objects"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "survey_blob_objects_tenant_id_key" ON "survey_blob_objects"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_blob_objects_tenant_ref_key" ON "survey_blob_objects"("tenant_id", "blob_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_blob_objects_tenant_storage_key" ON "survey_blob_objects"("tenant_id", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "survey_photos_blob_object_id_key" ON "survey_photos"("blob_object_id");

-- CreateIndex
CREATE INDEX "survey_photos_draft_purpose_idx" ON "survey_photos"("tenant_id", "draft_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "survey_photos_tenant_id_key" ON "survey_photos"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_photos_tenant_ref_key" ON "survey_photos"("tenant_id", "photo_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_pdf_blob_object_id_key" ON "survey_publications"("pdf_blob_object_id");

-- CreateIndex
CREATE INDEX "survey_publications_case_status_idx" ON "survey_publications"("tenant_id", "pipeline_case_id", "status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_tenant_id_key" ON "survey_publications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_tenant_ref_key" ON "survey_publications"("tenant_id", "publication_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_draft_revision_key" ON "survey_publications"("tenant_id", "draft_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_tenant_pdf_blob_key" ON "survey_publications"("tenant_id", "pdf_blob_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publications_tenant_replaces_key" ON "survey_publications"("tenant_id", "replaces_publication_id");

-- CreateIndex
CREATE INDEX "survey_publication_items_article_idx" ON "survey_publication_items"("tenant_id", "article_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_items_position_key" ON "survey_publication_items"("tenant_id", "publication_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_access_side_key" ON "survey_publication_access"("tenant_id", "publication_id", "side");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_signatures_publication_id_key" ON "survey_publication_signatures"("publication_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_signatures_blob_object_id_key" ON "survey_publication_signatures"("blob_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_signatures_tenant_ref_key" ON "survey_publication_signatures"("tenant_id", "signature_ref");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_signatures_tenant_publication_key" ON "survey_publication_signatures"("tenant_id", "publication_id");

-- CreateIndex
CREATE UNIQUE INDEX "survey_publication_signatures_tenant_blob_key" ON "survey_publication_signatures"("tenant_id", "blob_object_id");

-- CreateIndex
CREATE INDEX "survey_mutation_commands_target_idx" ON "survey_mutation_commands"("tenant_id", "target_ref", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_mutation_commands_tenant_request_key" ON "survey_mutation_commands"("tenant_id", "request_id");

-- AddForeignKey
ALTER TABLE "survey_catalog_versions" ADD CONSTRAINT "survey_catalog_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_catalog_versions" ADD CONSTRAINT "survey_catalog_versions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_article_catalog_items" ADD CONSTRAINT "survey_article_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_article_catalog_items" ADD CONSTRAINT "survey_article_catalog_items_version_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id") REFERENCES "survey_catalog_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_area_catalog_items" ADD CONSTRAINT "survey_area_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_area_catalog_items" ADD CONSTRAINT "survey_area_catalog_items_version_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id") REFERENCES "survey_catalog_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_condition_catalog_items" ADD CONSTRAINT "survey_condition_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_condition_catalog_items" ADD CONSTRAINT "survey_condition_catalog_items_version_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id") REFERENCES "survey_catalog_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_service_revision_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_evaluator_fkey" FOREIGN KEY ("tenant_id", "evaluator_membership_id", "evaluator_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_creator_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_assignment_fkey" FOREIGN KEY ("tenant_id", "assignment_id") REFERENCES "survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_service_revision_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_catalog_version_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id") REFERENCES "survey_catalog_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_draft_items" ADD CONSTRAINT "survey_draft_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_draft_items" ADD CONSTRAINT "survey_draft_items_draft_fkey" FOREIGN KEY ("tenant_id", "draft_id", "catalog_version_id") REFERENCES "survey_drafts"("tenant_id", "id", "catalog_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_draft_items" ADD CONSTRAINT "survey_draft_items_catalog_item_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id", "catalog_item_id") REFERENCES "survey_article_catalog_items"("tenant_id", "catalog_version_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_draft_items" ADD CONSTRAINT "survey_draft_items_area_item_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id", "area_catalog_item_id") REFERENCES "survey_area_catalog_items"("tenant_id", "catalog_version_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_access_observations" ADD CONSTRAINT "survey_access_observations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_access_observations" ADD CONSTRAINT "survey_access_observations_draft_fkey" FOREIGN KEY ("tenant_id", "draft_id") REFERENCES "survey_drafts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_blob_objects" ADD CONSTRAINT "survey_blob_objects_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_draft_fkey" FOREIGN KEY ("tenant_id", "draft_id") REFERENCES "survey_drafts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_item_fkey" FOREIGN KEY ("tenant_id", "draft_id", "draft_item_id") REFERENCES "survey_draft_items"("tenant_id", "draft_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_access_fkey" FOREIGN KEY ("tenant_id", "draft_id", "access_id") REFERENCES "survey_access_observations"("tenant_id", "draft_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_blob_fkey" FOREIGN KEY ("tenant_id", "blob_object_id") REFERENCES "survey_blob_objects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_draft_fkey" FOREIGN KEY ("tenant_id", "draft_id") REFERENCES "survey_drafts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_service_revision_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_pdf_blob_fkey" FOREIGN KEY ("tenant_id", "pdf_blob_object_id") REFERENCES "survey_blob_objects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_publication_id") REFERENCES "survey_publications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_actor_fkey" FOREIGN KEY ("tenant_id", "published_by_membership_id", "published_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_items" ADD CONSTRAINT "survey_publication_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_items" ADD CONSTRAINT "survey_publication_items_publication_fkey" FOREIGN KEY ("tenant_id", "publication_id") REFERENCES "survey_publications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_access" ADD CONSTRAINT "survey_publication_access_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_access" ADD CONSTRAINT "survey_publication_access_publication_fkey" FOREIGN KEY ("tenant_id", "publication_id") REFERENCES "survey_publications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_signatures" ADD CONSTRAINT "survey_publication_signatures_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_signatures" ADD CONSTRAINT "survey_publication_signatures_publication_fkey" FOREIGN KEY ("tenant_id", "publication_id") REFERENCES "survey_publications"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_publication_signatures" ADD CONSTRAINT "survey_publication_signatures_blob_fkey" FOREIGN KEY ("tenant_id", "blob_object_id") REFERENCES "survey_blob_objects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_mutation_commands" ADD CONSTRAINT "survey_mutation_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_mutation_commands" ADD CONSTRAINT "survey_mutation_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain integrity
ALTER TABLE "survey_catalog_versions" ADD CONSTRAINT "survey_catalog_versions_version_check" CHECK ("version" > 0);
CREATE UNIQUE INDEX "survey_catalog_versions_one_active_per_tenant_key" ON "survey_catalog_versions"("tenant_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "survey_article_catalog_items" ADD CONSTRAINT "survey_article_catalog_metrics_check" CHECK (
  ("default_volume_m3" IS NULL OR "default_volume_m3" > 0)
  AND ("default_weight_kg" IS NULL OR "default_weight_kg" > 0)
  AND ("default_weight_kg" IS NULL OR "weight_source" IS NOT NULL)
);
ALTER TABLE "survey_assignments" ADD CONSTRAINT "survey_assignments_schedule_check" CHECK (
  "route_version" > 0 AND "version" > 0 AND ("scheduled_end" IS NULL OR "scheduled_end" > "scheduled_start")
);
ALTER TABLE "survey_drafts" ADD CONSTRAINT "survey_drafts_version_check" CHECK ("route_version" > 0 AND "revision" > 0 AND "version" > 0);
ALTER TABLE "survey_draft_items" ADD CONSTRAINT "survey_draft_items_values_check" CHECK (
  "quantity" BETWEEN 1 AND 999 AND "sort_order" >= 0 AND "version" > 0
  AND (("length_cm" IS NULL AND "width_cm" IS NULL AND "height_cm" IS NULL)
    OR ("length_cm" > 0 AND "width_cm" > 0 AND "height_cm" > 0 AND "original_unit" IS NOT NULL AND "original_dimensions" IS NOT NULL))
  AND ("unit_volume_m3" IS NULL OR "unit_volume_m3" > 0)
  AND ("unit_weight_kg" IS NULL OR "unit_weight_kg" > 0)
);
ALTER TABLE "survey_access_observations" ADD CONSTRAINT "survey_access_observations_values_check" CHECK (
  "version" > 0
  AND ("floor_number" IS NULL OR "floor_number" BETWEEN -10 AND 250)
  AND ("stairs_floors" IS NULL OR "stairs_floors" BETWEEN 0 AND 250)
  AND ("elevator_floor" IS NULL OR "elevator_floor" BETWEEN -10 AND 250)
  AND ("parking_distance_m" IS NULL OR "parking_distance_m" >= 0)
);
ALTER TABLE "survey_blob_objects" ADD CONSTRAINT "survey_blob_objects_values_check" CHECK (
  "size_bytes" BETWEEN 1 AND 12582912
  AND "mime_type" IN ('image/jpeg','image/png','image/webp','image/svg+xml','application/pdf')
  AND "sha256" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_context_check" CHECK (
  ("purpose" = 'GENERAL' AND "draft_item_id" IS NULL AND "access_id" IS NULL)
  OR ("purpose" IN ('ITEM','DAMAGE','SPECIAL_CONDITION') AND "draft_item_id" IS NOT NULL AND "access_id" IS NULL)
  OR ("purpose" IN ('ORIGIN_ACCESS','DESTINATION_ACCESS') AND "draft_item_id" IS NULL AND "access_id" IS NOT NULL)
);
ALTER TABLE "survey_publications" ADD CONSTRAINT "survey_publications_values_check" CHECK (
  "revision" > 0 AND "route_version" > 0 AND "catalog_version" > 0
  AND "logical_sha256" ~ '^[0-9a-f]{64}$' AND "pdf_sha256" ~ '^[0-9a-f]{64}$'
);
CREATE UNIQUE INDEX "survey_publications_one_current_per_case_key" ON "survey_publications"("tenant_id", "pipeline_case_id") WHERE "status" = 'CURRENT';
ALTER TABLE "survey_publication_items" ADD CONSTRAINT "survey_publication_items_values_check" CHECK (
  "position" >= 0 AND "quantity" BETWEEN 1 AND 999
  AND ("unit_volume_m3" IS NULL OR "unit_volume_m3" > 0)
  AND ("unit_weight_kg" IS NULL OR "unit_weight_kg" > 0)
);

-- Stable public identities and immutable published facts.
CREATE OR REPLACE FUNCTION "survey_guard_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SURVEY_IMMUTABLE_RECORD' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION "survey_guard_stable_refs"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'survey_catalog_versions' THEN
    IF ROW(NEW."tenant_id", NEW."catalog_ref", NEW."version") IS DISTINCT FROM ROW(OLD."tenant_id", OLD."catalog_ref", OLD."version") THEN RAISE EXCEPTION 'SURVEY_STABLE_REFERENCE' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'survey_assignments' THEN
    IF ROW(NEW."tenant_id", NEW."assignment_ref", NEW."pipeline_case_id", NEW."service_revision_id", NEW."route_version") IS DISTINCT FROM ROW(OLD."tenant_id", OLD."assignment_ref", OLD."pipeline_case_id", OLD."service_revision_id", OLD."route_version") THEN RAISE EXCEPTION 'SURVEY_STABLE_REFERENCE' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'survey_drafts' THEN
    IF ROW(NEW."tenant_id", NEW."survey_ref", NEW."assignment_id", NEW."pipeline_case_id", NEW."service_revision_id", NEW."catalog_version_id", NEW."route_version", NEW."revision") IS DISTINCT FROM ROW(OLD."tenant_id", OLD."survey_ref", OLD."assignment_id", OLD."pipeline_case_id", OLD."service_revision_id", OLD."catalog_version_id", OLD."route_version", OLD."revision") THEN RAISE EXCEPTION 'SURVEY_STABLE_REFERENCE' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'survey_blob_objects' THEN
    IF ROW(NEW."tenant_id", NEW."blob_ref", NEW."provider", NEW."storage_key", NEW."mime_type", NEW."size_bytes", NEW."sha256") IS DISTINCT FROM ROW(OLD."tenant_id", OLD."blob_ref", OLD."provider", OLD."storage_key", OLD."mime_type", OLD."size_bytes", OLD."sha256") THEN RAISE EXCEPTION 'SURVEY_STABLE_REFERENCE' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "survey_guard_draft_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE draft_status "SurveyDraftStatus";
DECLARE tenant_key TEXT;
DECLARE draft_key TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN tenant_key := OLD."tenant_id"; draft_key := OLD."draft_id";
  ELSE tenant_key := NEW."tenant_id"; draft_key := NEW."draft_id"; END IF;
  SELECT "status" INTO draft_status FROM "survey_drafts" WHERE "tenant_id" = tenant_key AND "id" = draft_key;
  IF draft_status = 'PUBLISHED' THEN RAISE EXCEPTION 'SURVEY_PUBLISHED_DRAFT_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "survey_guard_publication_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'CURRENT' AND NEW."status" = 'SUPERSEDED'
    AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'SURVEY_PUBLICATION_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "survey_catalog_versions_stable" BEFORE UPDATE ON "survey_catalog_versions" FOR EACH ROW EXECUTE FUNCTION "survey_guard_stable_refs"();
CREATE TRIGGER "survey_assignments_stable" BEFORE UPDATE ON "survey_assignments" FOR EACH ROW EXECUTE FUNCTION "survey_guard_stable_refs"();
CREATE TRIGGER "survey_drafts_stable" BEFORE UPDATE ON "survey_drafts" FOR EACH ROW EXECUTE FUNCTION "survey_guard_stable_refs"();
CREATE TRIGGER "survey_blob_objects_stable" BEFORE UPDATE ON "survey_blob_objects" FOR EACH ROW EXECUTE FUNCTION "survey_guard_stable_refs"();
CREATE TRIGGER "survey_article_catalog_items_immutable" BEFORE UPDATE OR DELETE ON "survey_article_catalog_items" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_area_catalog_items_immutable" BEFORE UPDATE OR DELETE ON "survey_area_catalog_items" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_condition_catalog_items_immutable" BEFORE UPDATE OR DELETE ON "survey_condition_catalog_items" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_draft_items_mutable_only_before_publish" BEFORE UPDATE OR DELETE ON "survey_draft_items" FOR EACH ROW EXECUTE FUNCTION "survey_guard_draft_mutation"();
CREATE TRIGGER "survey_access_mutable_only_before_publish" BEFORE UPDATE OR DELETE ON "survey_access_observations" FOR EACH ROW EXECUTE FUNCTION "survey_guard_draft_mutation"();
CREATE TRIGGER "survey_photos_mutable_only_before_publish" BEFORE UPDATE OR DELETE ON "survey_photos" FOR EACH ROW EXECUTE FUNCTION "survey_guard_draft_mutation"();
CREATE TRIGGER "survey_publications_update_guard" BEFORE UPDATE ON "survey_publications" FOR EACH ROW EXECUTE FUNCTION "survey_guard_publication_update"();
CREATE TRIGGER "survey_publications_delete_guard" BEFORE DELETE ON "survey_publications" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_publication_items_immutable" BEFORE UPDATE OR DELETE ON "survey_publication_items" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_publication_access_immutable" BEFORE UPDATE OR DELETE ON "survey_publication_access" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
CREATE TRIGGER "survey_publication_signatures_immutable" BEFORE UPDATE OR DELETE ON "survey_publication_signatures" FOR EACH ROW EXECUTE FUNCTION "survey_guard_immutable"();
