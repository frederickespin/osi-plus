-- V17-CLIENT-TEMPORARY-PORTAL-16A
-- Additive tenant-first authority for short-lived client access. Tokens are
-- represented only by SHA-256 digests; client contributions remain explicitly
-- unverified until an evaluator publishes a Survey revision.

CREATE TYPE "osi"."ClientTemporaryAccessPurpose" AS ENUM ('VISIT', 'INFORMATION_REQUEST', 'MINI_SURVEY');
CREATE TYPE "osi"."ClientTemporaryAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED');
CREATE TYPE "osi"."ClientTemporaryAccessScope" AS ENUM ('VISIT_VIEW', 'VISIT_CONFIRM', 'VISIT_CHANGE_REQUEST', 'VISIT_CANCEL_REQUEST', 'VISIT_QR_CONFIRM', 'SURVEY_INFO_VIEW', 'SURVEY_INFO_UPLOAD', 'MINI_SURVEY_EDIT');
CREATE TYPE "osi"."ClientTemporaryAccessEventType" AS ENUM ('ACCESS_CREATED', 'ACCESS_REVOKED', 'ACCESS_USED', 'VISIT_CONFIRMED', 'CHANGE_REQUESTED', 'CANCELLATION_REQUESTED', 'SURVEY_ASSET_UPLOADED', 'MINI_SURVEY_SAVED', 'MINI_SURVEY_COMPLETED', 'QR_VALIDATED');
CREATE TYPE "osi"."ClientTemporaryActorKind" AS ENUM ('EMPLOYEE', 'CLIENT_TEMPORARY', 'SYSTEM');
CREATE TYPE "osi"."ClientTemporaryVisitResponseState" AS ENUM ('PENDING', 'CONFIRMED', 'CHANGE_REQUESTED', 'CANCEL_REQUESTED', 'EXPIRED');
CREATE TYPE "osi"."ClientSurveyContributionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SUPERSEDED');
CREATE TYPE "osi"."ClientSurveyInformationSource" AS ENUM ('CLIENT_SUPPLIED', 'EVALUATOR_VERIFIED');
CREATE TYPE "osi"."ClientSurveyAssetCategory" AS ENUM ('PHOTO', 'DOCUMENT');
CREATE TYPE "osi"."ClientSurveyDocumentType" AS ENUM ('INVENTORY_LIST', 'ACCESS_PLAN', 'PROPERTY_DOCUMENT', 'OTHER_AUTHORIZED');
CREATE TYPE "osi"."ClientTemporaryQrResult" AS ENUM ('VERIFIED', 'REJECTED');

CREATE UNIQUE INDEX "survey_assignments_tenant_id_case_key"
  ON "osi"."survey_assignments"("tenant_id", "id", "pipeline_case_id");
CREATE UNIQUE INDEX "communication_records_tenant_id_key"
  ON "osi"."communication_records"("tenant_id", "id");

CREATE TABLE "osi"."client_temporary_accesses" (
  "id" TEXT PRIMARY KEY,
  "access_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "client_id" TEXT,
  "survey_assignment_id" TEXT,
  "selected_contact_id" TEXT NOT NULL,
  "communication_record_id" TEXT,
  "token_hash" CHAR(64) NOT NULL,
  "short_code_hash" CHAR(64),
  "short_code_salt" CHAR(32),
  "short_code_expires_at" TIMESTAMPTZ(6),
  "short_code_failed_count" INTEGER NOT NULL DEFAULT 0,
  "short_code_locked_until" TIMESTAMPTZ(6),
  "purpose" "osi"."ClientTemporaryAccessPurpose" NOT NULL,
  "status" "osi"."ClientTemporaryAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "max_uses" INTEGER NOT NULL,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revocation_reason" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "issued_by_membership_id" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL,
  CONSTRAINT "client_temporary_accesses_values_check" CHECK (
    "token_hash" ~ '^[0-9a-f]{64}$' AND
    ("short_code_hash" IS NULL OR "short_code_hash" ~ '^[0-9a-f]{64}$') AND
    "max_uses" BETWEEN 1 AND 1000 AND
    "use_count" BETWEEN 0 AND "max_uses" AND
    "expires_at" > "issued_at" AND
    "version" > 0 AND
    "short_code_failed_count" BETWEEN 0 AND 20 AND
    (("short_code_hash" IS NULL AND "short_code_salt" IS NULL AND "short_code_expires_at" IS NULL) OR
     ("short_code_hash" IS NOT NULL AND "short_code_salt" ~ '^[0-9a-f]{32}$' AND "short_code_expires_at" IS NOT NULL)) AND
    (("status" = 'REVOKED' AND "revoked_at" IS NOT NULL) OR
     ("status" <> 'REVOKED' AND "revoked_at" IS NULL))
  ),
  CONSTRAINT "client_temporary_accesses_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_client_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "osi"."osi_clients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_assignment_fkey" FOREIGN KEY ("tenant_id", "survey_assignment_id", "pipeline_case_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id", "pipeline_case_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_contact_fkey" FOREIGN KEY ("tenant_id", "selected_contact_id") REFERENCES "osi"."commercial_entity_contacts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_communication_fkey" FOREIGN KEY ("tenant_id", "communication_record_id") REFERENCES "osi"."communication_records"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_accesses_issuer_fkey" FOREIGN KEY ("tenant_id", "issued_by_membership_id", "issued_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_accesses_access_ref_key" ON "osi"."client_temporary_accesses"("access_ref");
CREATE UNIQUE INDEX "client_temporary_accesses_token_hash_key" ON "osi"."client_temporary_accesses"("token_hash");
CREATE UNIQUE INDEX "client_temporary_accesses_tenant_id_key" ON "osi"."client_temporary_accesses"("tenant_id", "id");
CREATE UNIQUE INDEX "client_temporary_accesses_tenant_id_assignment_key" ON "osi"."client_temporary_accesses"("tenant_id", "id", "survey_assignment_id");
CREATE UNIQUE INDEX "client_temporary_accesses_tenant_ref_key" ON "osi"."client_temporary_accesses"("tenant_id", "access_ref");
CREATE UNIQUE INDEX "client_temporary_accesses_communication_key" ON "osi"."client_temporary_accesses"("tenant_id", "communication_record_id");
CREATE INDEX "client_temporary_accesses_case_status_idx" ON "osi"."client_temporary_accesses"("tenant_id", "pipeline_case_id", "status", "expires_at");
CREATE INDEX "client_temporary_accesses_assignment_idx" ON "osi"."client_temporary_accesses"("tenant_id", "survey_assignment_id", "status");
CREATE INDEX "client_temporary_accesses_expiry_idx" ON "osi"."client_temporary_accesses"("status", "expires_at");

CREATE TABLE "osi"."client_temporary_access_grants" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "scope" "osi"."ClientTemporaryAccessScope" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_temporary_access_grants_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_access_grants_access_fkey" FOREIGN KEY ("tenant_id", "access_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_access_grants_scope_key" ON "osi"."client_temporary_access_grants"("tenant_id", "access_id", "scope");
CREATE INDEX "client_temporary_access_grants_scope_idx" ON "osi"."client_temporary_access_grants"("tenant_id", "scope", "access_id");

CREATE TABLE "osi"."client_temporary_access_events" (
  "id" TEXT PRIMARY KEY,
  "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "event_type" "osi"."ClientTemporaryAccessEventType" NOT NULL,
  "actor_kind" "osi"."ClientTemporaryActorKind" NOT NULL,
  "actor_membership_id" TEXT,
  "actor_user_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_temporary_access_events_actor_check" CHECK (
    ("actor_kind" = 'EMPLOYEE' AND "actor_membership_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
    ("actor_kind" <> 'EMPLOYEE' AND "actor_membership_id" IS NULL AND "actor_user_id" IS NULL)
  ),
  CONSTRAINT "client_temporary_access_events_metadata_check" CHECK (jsonb_typeof("metadata") = 'object'),
  CONSTRAINT "client_temporary_access_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_access_events_access_fkey" FOREIGN KEY ("tenant_id", "access_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_access_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_access_events_tenant_ref_key" ON "osi"."client_temporary_access_events"("tenant_id", "event_ref");
CREATE INDEX "client_temporary_access_events_access_idx" ON "osi"."client_temporary_access_events"("tenant_id", "access_id", "occurred_at" DESC);

CREATE TABLE "osi"."client_temporary_access_commands" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "result_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_temporary_access_commands_values_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$' AND btrim("request_id") <> '' AND btrim("operation") <> ''),
  CONSTRAINT "client_temporary_access_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_access_commands_access_fkey" FOREIGN KEY ("tenant_id", "access_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_access_commands_request_key" ON "osi"."client_temporary_access_commands"("tenant_id", "request_id");
CREATE INDEX "client_temporary_access_commands_operation_idx" ON "osi"."client_temporary_access_commands"("tenant_id", "access_id", "operation", "created_at" DESC);

CREATE TABLE "osi"."client_temporary_visit_responses" (
  "id" TEXT PRIMARY KEY,
  "response_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "survey_assignment_id" TEXT NOT NULL,
  "state" "osi"."ClientTemporaryVisitResponseState" NOT NULL DEFAULT 'PENDING',
  "visit_reason_id" TEXT,
  "comment" VARCHAR(1000),
  "suggested_availability" JSONB NOT NULL DEFAULT '[]',
  "confirmed_at" TIMESTAMPTZ(6),
  "change_requested_at" TIMESTAMPTZ(6),
  "cancellation_requested_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_temporary_visit_responses_values_check" CHECK (
    "version" > 0 AND jsonb_typeof("suggested_availability") = 'array' AND
    (("state" = 'PENDING') OR
     ("state" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL) OR
     ("state" = 'CHANGE_REQUESTED' AND "change_requested_at" IS NOT NULL) OR
     ("state" = 'CANCEL_REQUESTED' AND "cancellation_requested_at" IS NOT NULL) OR
     ("state" = 'EXPIRED'))
  ),
  CONSTRAINT "client_temporary_visit_responses_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_visit_responses_access_fkey" FOREIGN KEY ("tenant_id", "access_id", "survey_assignment_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id", "survey_assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_visit_responses_assignment_fkey" FOREIGN KEY ("tenant_id", "survey_assignment_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_visit_responses_reason_fkey" FOREIGN KEY ("tenant_id", "visit_reason_id") REFERENCES "osi"."visit_reasons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_visit_responses_tenant_ref_key" ON "osi"."client_temporary_visit_responses"("tenant_id", "response_ref");
CREATE UNIQUE INDEX "client_temporary_visit_responses_access_key" ON "osi"."client_temporary_visit_responses"("tenant_id", "access_id");
CREATE UNIQUE INDEX "client_temporary_visit_responses_access_assignment_key" ON "osi"."client_temporary_visit_responses"("tenant_id", "access_id", "survey_assignment_id");
CREATE INDEX "client_temporary_visit_responses_scheduling_idx" ON "osi"."client_temporary_visit_responses"("tenant_id", "survey_assignment_id", "state", "updated_at" DESC);

CREATE TABLE "osi"."client_survey_contributions" (
  "id" TEXT PRIMARY KEY,
  "contribution_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "survey_assignment_id" TEXT NOT NULL,
  "catalog_version_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" "osi"."ClientSurveyContributionStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "osi"."ClientSurveyInformationSource" NOT NULL DEFAULT 'CLIENT_SUPPLIED',
  "notes" VARCHAR(2000),
  "estimated_weight_kg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "estimated_volume_m3" DECIMAL(14,6) NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "submitted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_survey_contributions_values_check" CHECK (
    "revision" > 0 AND "version" > 0 AND "estimated_weight_kg" >= 0 AND "estimated_volume_m3" >= 0 AND
    "source" = 'CLIENT_SUPPLIED' AND (("status" = 'SUBMITTED' AND "submitted_at" IS NOT NULL) OR "status" <> 'SUBMITTED')
  ),
  CONSTRAINT "client_survey_contributions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contributions_access_fkey" FOREIGN KEY ("tenant_id", "access_id", "survey_assignment_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id", "survey_assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contributions_assignment_fkey" FOREIGN KEY ("tenant_id", "survey_assignment_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contributions_catalog_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id") REFERENCES "osi"."survey_catalog_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_survey_contributions_tenant_id_key" ON "osi"."client_survey_contributions"("tenant_id", "id");
CREATE UNIQUE INDEX "client_survey_contributions_tenant_id_catalog_key" ON "osi"."client_survey_contributions"("tenant_id", "id", "catalog_version_id");
CREATE UNIQUE INDEX "client_survey_contributions_tenant_ref_key" ON "osi"."client_survey_contributions"("tenant_id", "contribution_ref");
CREATE UNIQUE INDEX "client_survey_contributions_revision_key" ON "osi"."client_survey_contributions"("tenant_id", "access_id", "revision");
CREATE INDEX "client_survey_contributions_assignment_idx" ON "osi"."client_survey_contributions"("tenant_id", "survey_assignment_id", "status", "updated_at" DESC);

CREATE TABLE "osi"."client_survey_contribution_items" (
  "id" TEXT PRIMARY KEY,
  "item_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "contribution_id" TEXT NOT NULL,
  "catalog_version_id" TEXT NOT NULL,
  "catalog_item_id" TEXT NOT NULL,
  "article_ref_snapshot" UUID NOT NULL,
  "article_code_snapshot" VARCHAR(64) NOT NULL,
  "article_name_snapshot" VARCHAR(160) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_volume_m3" DECIMAL(12,6),
  "unit_weight_kg" DECIMAL(12,3),
  "total_volume_m3" DECIMAL(14,6),
  "total_weight_kg" DECIMAL(14,3),
  "source" "osi"."ClientSurveyInformationSource" NOT NULL DEFAULT 'CLIENT_SUPPLIED',
  "client_measurements" JSONB,
  "notes" VARCHAR(1000),
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_survey_contribution_items_values_check" CHECK (
    "quantity" BETWEEN 1 AND 10000 AND "sort_order" BETWEEN 0 AND 9 AND "source" = 'CLIENT_SUPPLIED' AND
    ("client_measurements" IS NULL OR jsonb_typeof("client_measurements") = 'object') AND
    coalesce("unit_volume_m3", 0) >= 0 AND coalesce("unit_weight_kg", 0) >= 0 AND
    coalesce("total_volume_m3", 0) >= 0 AND coalesce("total_weight_kg", 0) >= 0
  ),
  CONSTRAINT "client_survey_contribution_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contribution_items_contribution_fkey" FOREIGN KEY ("tenant_id", "contribution_id", "catalog_version_id") REFERENCES "osi"."client_survey_contributions"("tenant_id", "id", "catalog_version_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contribution_items_catalog_fkey" FOREIGN KEY ("tenant_id", "catalog_version_id", "catalog_item_id") REFERENCES "osi"."survey_article_catalog_items"("tenant_id", "catalog_version_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_survey_contribution_items_tenant_ref_key" ON "osi"."client_survey_contribution_items"("tenant_id", "item_ref");
CREATE UNIQUE INDEX "client_survey_contribution_items_type_key" ON "osi"."client_survey_contribution_items"("tenant_id", "contribution_id", "catalog_item_id");
CREATE UNIQUE INDEX "client_survey_contribution_items_order_key" ON "osi"."client_survey_contribution_items"("tenant_id", "contribution_id", "sort_order");
CREATE INDEX "client_survey_contribution_items_catalog_idx" ON "osi"."client_survey_contribution_items"("tenant_id", "catalog_version_id", "catalog_item_id");

CREATE TABLE "osi"."client_survey_contribution_assets" (
  "id" TEXT PRIMARY KEY,
  "asset_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "contribution_id" TEXT NOT NULL,
  "blob_object_id" TEXT NOT NULL,
  "category" "osi"."ClientSurveyAssetCategory" NOT NULL,
  "document_type" "osi"."ClientSurveyDocumentType",
  "source" "osi"."ClientSurveyInformationSource" NOT NULL DEFAULT 'CLIENT_SUPPLIED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_survey_contribution_assets_category_check" CHECK (
    "source" = 'CLIENT_SUPPLIED' AND (("category" = 'PHOTO' AND "document_type" IS NULL) OR ("category" = 'DOCUMENT' AND "document_type" IS NOT NULL))
  ),
  CONSTRAINT "client_survey_contribution_assets_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contribution_assets_contribution_fkey" FOREIGN KEY ("tenant_id", "contribution_id") REFERENCES "osi"."client_survey_contributions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_survey_contribution_assets_blob_fkey" FOREIGN KEY ("tenant_id", "blob_object_id") REFERENCES "osi"."survey_blob_objects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_survey_contribution_assets_tenant_ref_key" ON "osi"."client_survey_contribution_assets"("tenant_id", "asset_ref");
CREATE UNIQUE INDEX "client_survey_contribution_assets_blob_key" ON "osi"."client_survey_contribution_assets"("tenant_id", "blob_object_id");
CREATE INDEX "client_survey_contribution_assets_contribution_idx" ON "osi"."client_survey_contribution_assets"("tenant_id", "contribution_id", "category", "created_at");

CREATE TABLE "osi"."client_temporary_qr_confirmations" (
  "id" TEXT PRIMARY KEY,
  "confirmation_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "access_id" TEXT NOT NULL,
  "survey_assignment_id" TEXT NOT NULL,
  "visit_ref_snapshot" UUID NOT NULL,
  "evaluator_ref_snapshot" UUID NOT NULL,
  "result" "osi"."ClientTemporaryQrResult" NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_temporary_qr_confirmations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_qr_confirmations_access_fkey" FOREIGN KEY ("tenant_id", "access_id", "survey_assignment_id") REFERENCES "osi"."client_temporary_accesses"("tenant_id", "id", "survey_assignment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_temporary_qr_confirmations_assignment_fkey" FOREIGN KEY ("tenant_id", "survey_assignment_id") REFERENCES "osi"."survey_assignments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "client_temporary_qr_confirmations_tenant_ref_key" ON "osi"."client_temporary_qr_confirmations"("tenant_id", "confirmation_ref");
CREATE INDEX "client_temporary_qr_confirmations_assignment_idx" ON "osi"."client_temporary_qr_confirmations"("tenant_id", "survey_assignment_id", "confirmed_at" DESC);

CREATE OR REPLACE FUNCTION "osi"."client_temporary_access_immutable_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."access_ref" IS DISTINCT FROM OLD."access_ref"
    OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."pipeline_case_id" IS DISTINCT FROM OLD."pipeline_case_id"
    OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
    OR NEW."survey_assignment_id" IS DISTINCT FROM OLD."survey_assignment_id"
    OR NEW."selected_contact_id" IS DISTINCT FROM OLD."selected_contact_id"
    OR NEW."communication_record_id" IS DISTINCT FROM OLD."communication_record_id"
    OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
    OR NEW."short_code_hash" IS DISTINCT FROM OLD."short_code_hash"
    OR NEW."short_code_salt" IS DISTINCT FROM OLD."short_code_salt"
    OR NEW."short_code_expires_at" IS DISTINCT FROM OLD."short_code_expires_at"
    OR NEW."purpose" IS DISTINCT FROM OLD."purpose"
    OR NEW."max_uses" IS DISTINCT FROM OLD."max_uses"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
    OR NEW."issued_by_membership_id" IS DISTINCT FROM OLD."issued_by_membership_id"
    OR NEW."issued_by_user_id" IS DISTINCT FROM OLD."issued_by_user_id"
  THEN RAISE EXCEPTION 'CLIENT_TEMPORARY_ACCESS_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "client_temporary_accesses_immutable_trigger" BEFORE UPDATE ON "osi"."client_temporary_accesses" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_access_immutable_guard"();

CREATE OR REPLACE FUNCTION "osi"."client_temporary_append_only_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CLIENT_TEMPORARY_APPEND_ONLY'; END $$;
CREATE TRIGGER "client_temporary_access_grants_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_temporary_access_grants" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();
CREATE TRIGGER "client_temporary_access_events_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_temporary_access_events" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();
CREATE TRIGGER "client_temporary_access_commands_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_temporary_access_commands" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();
CREATE TRIGGER "client_survey_contribution_items_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_survey_contribution_items" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();
CREATE TRIGGER "client_survey_contribution_assets_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_survey_contribution_assets" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();
CREATE TRIGGER "client_temporary_qr_confirmations_append_only" BEFORE UPDATE OR DELETE ON "osi"."client_temporary_qr_confirmations" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_append_only_guard"();

CREATE OR REPLACE FUNCTION "osi"."client_temporary_mini_limit_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE item_count INTEGER;
BEGIN
  SELECT count(*) INTO item_count FROM "osi"."client_survey_contribution_items"
  WHERE "tenant_id" = NEW."tenant_id" AND "contribution_id" = NEW."contribution_id";
  IF item_count >= 10 THEN RAISE EXCEPTION 'CLIENT_TEMPORARY_MINI_REQUIRES_DETAILED_SURVEY'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "client_survey_contribution_items_limit_trigger" BEFORE INSERT ON "osi"."client_survey_contribution_items" FOR EACH ROW EXECUTE FUNCTION "osi"."client_temporary_mini_limit_guard"();
