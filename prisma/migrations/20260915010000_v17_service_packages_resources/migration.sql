-- V17-SERVICE-PACKAGES-RESOURCES-15A
-- Additive, tenant-first authorities for reusable service packages, material
-- policies and immutable per-case service configuration revisions.

CREATE TYPE "osi"."ServiceConfigurationState" AS ENUM ('DRAFT', 'PUBLISHED', 'INACTIVE');
CREATE TYPE "osi"."ServicePackageServiceKind" AS ENUM ('PRIMARY', 'COMPLEMENTARY');
CREATE TYPE "osi"."ServiceRequirementKind" AS ENUM ('PERSONNEL', 'MATERIAL', 'ASSET', 'VEHICLE', 'TRANSPORT', 'DURATION', 'CRATING');
CREATE TYPE "osi"."ServiceMaterialDisposition" AS ENUM ('CONSUMED', 'RENTED', 'RETURNABLE', 'USAGE_CHARGE');
CREATE TYPE "osi"."ServiceResourceChargeType" AS ENUM ('INCLUDED', 'SALE', 'RENTAL', 'USAGE', 'PREPARATION', 'MAINTENANCE', 'DETERIORATION', 'REPLACEMENT');
CREATE TYPE "osi"."CaseServiceConfigurationSource" AS ENUM ('PACKAGE', 'COMMERCIAL_AGREEMENT', 'CASE_OVERRIDE', 'MANUAL_RESOLUTION');
CREATE TYPE "osi"."CaseServiceConfigurationItemKind" AS ENUM ('PRIMARY_SERVICE', 'COMPLEMENTARY_SERVICE', 'PERSONNEL', 'MATERIAL', 'ASSET', 'VEHICLE', 'TRANSPORT', 'DURATION', 'CRATING');
CREATE TYPE "osi"."ServiceRequirementSource" AS ENUM ('SERVICE_DEFAULT', 'PACKAGE', 'MATERIAL_POLICY', 'COMMERCIAL_AGREEMENT', 'SURVEY', 'CASE_OVERRIDE');
CREATE TYPE "osi"."ServiceConfigurationConflictState" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "osi"."service_mode_definitions" (
  "id" TEXT PRIMARY KEY,
  "mode_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(500),
  "state" "osi"."ServiceConfigurationState" NOT NULL DEFAULT 'DRAFT',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_mode_definitions_values_check" CHECK ("code" = upper(btrim("code")) AND "code" <> '' AND "version" > 0),
  CONSTRAINT "service_mode_definitions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_mode_definitions_tenant_id_key" ON "osi"."service_mode_definitions"("tenant_id", "id");
CREATE UNIQUE INDEX "service_mode_definitions_tenant_ref_key" ON "osi"."service_mode_definitions"("tenant_id", "mode_ref");
CREATE UNIQUE INDEX "service_mode_definitions_tenant_code_key" ON "osi"."service_mode_definitions"("tenant_id", "code");
CREATE INDEX "service_mode_definitions_catalog_idx" ON "osi"."service_mode_definitions"("tenant_id", "state", "sort_order");

CREATE TABLE "osi"."service_catalog_modes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "mode_id" TEXT NOT NULL,
  CONSTRAINT "service_catalog_modes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_catalog_modes_service_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_catalog_modes_mode_fkey" FOREIGN KEY ("tenant_id", "mode_id") REFERENCES "osi"."service_mode_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_catalog_modes_scope_key" ON "osi"."service_catalog_modes"("tenant_id", "service_id", "mode_id");
CREATE INDEX "service_catalog_modes_mode_idx" ON "osi"."service_catalog_modes"("tenant_id", "mode_id", "service_id");

CREATE TABLE "osi"."service_packages" (
  "id" TEXT PRIMARY KEY,
  "package_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_packages_code_check" CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
  CONSTRAINT "service_packages_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_packages_tenant_id_key" ON "osi"."service_packages"("tenant_id", "id");
CREATE UNIQUE INDEX "service_packages_tenant_ref_key" ON "osi"."service_packages"("tenant_id", "package_ref");
CREATE UNIQUE INDEX "service_packages_tenant_code_key" ON "osi"."service_packages"("tenant_id", "code");

CREATE TABLE "osi"."service_package_versions" (
  "id" TEXT PRIMARY KEY,
  "version_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "package_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "osi"."ServiceConfigurationState" NOT NULL DEFAULT 'DRAFT',
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "category" VARCHAR(80),
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "replaces_version_id" TEXT,
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "service_package_versions_values_check" CHECK ("version" > 0 AND btrim("name") <> '' AND ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from") AND (("state" = 'PUBLISHED' AND "published_at" IS NOT NULL) OR "state" <> 'PUBLISHED')),
  CONSTRAINT "service_package_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_versions_package_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "osi"."service_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_versions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_package_versions_tenant_id_key" ON "osi"."service_package_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "service_package_versions_tenant_ref_key" ON "osi"."service_package_versions"("tenant_id", "version_ref");
CREATE UNIQUE INDEX "service_package_versions_package_version_key" ON "osi"."service_package_versions"("tenant_id", "package_id", "version");
CREATE UNIQUE INDEX "service_package_versions_replaces_key" ON "osi"."service_package_versions"("tenant_id", "replaces_version_id");
CREATE UNIQUE INDEX "service_package_versions_one_published_key" ON "osi"."service_package_versions"("tenant_id", "package_id") WHERE "state" = 'PUBLISHED';
CREATE INDEX "service_package_versions_active_idx" ON "osi"."service_package_versions"("tenant_id", "state", "valid_from", "valid_to");
ALTER TABLE "osi"."service_package_versions" ADD CONSTRAINT "service_package_versions_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "osi"."service_package_version_modes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "package_version_id" TEXT NOT NULL,
  "mode_id" TEXT NOT NULL,
  CONSTRAINT "service_package_version_modes_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_version_modes_version_fkey" FOREIGN KEY ("tenant_id", "package_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_version_modes_mode_fkey" FOREIGN KEY ("tenant_id", "mode_id") REFERENCES "osi"."service_mode_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_package_version_modes_scope_key" ON "osi"."service_package_version_modes"("tenant_id", "package_version_id", "mode_id");

CREATE TABLE "osi"."service_package_version_services" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "package_version_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "kind" "osi"."ServicePackageServiceKind" NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "service_package_version_services_position_check" CHECK ("position" >= 0),
  CONSTRAINT "service_package_version_services_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_version_services_version_fkey" FOREIGN KEY ("tenant_id", "package_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_version_services_service_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_package_version_services_service_key" ON "osi"."service_package_version_services"("tenant_id", "package_version_id", "service_id");
CREATE UNIQUE INDEX "service_package_version_services_position_key" ON "osi"."service_package_version_services"("tenant_id", "package_version_id", "position");
CREATE UNIQUE INDEX "service_package_version_services_primary_key" ON "osi"."service_package_version_services"("tenant_id", "package_version_id") WHERE "kind" = 'PRIMARY';
CREATE INDEX "service_package_version_services_catalog_idx" ON "osi"."service_package_version_services"("tenant_id", "service_id", "kind");

CREATE TABLE "osi"."service_package_requirements" (
  "id" TEXT PRIMARY KEY,
  "requirement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "package_version_id" TEXT NOT NULL,
  "kind" "osi"."ServiceRequirementKind" NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "quantity" DECIMAL(18,6),
  "unit_code" VARCHAR(32),
  "hours" DECIMAL(10,2),
  "days" DECIMAL(10,2),
  "phase_code" VARCHAR(64),
  "material_id" TEXT,
  "asset_model_id" TEXT,
  "capability_id" TEXT,
  "disposition" "osi"."ServiceMaterialDisposition",
  "charge_type" "osi"."ServiceResourceChargeType",
  "configuration" JSONB NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL,
  CONSTRAINT "service_package_requirements_values_check" CHECK ("position" >= 0 AND coalesce("quantity", 0) >= 0 AND coalesce("hours", 0) >= 0 AND coalesce("days", 0) >= 0),
  CONSTRAINT "service_package_requirements_authority_check" CHECK (("kind" = 'PERSONNEL' AND "capability_id" IS NOT NULL AND "material_id" IS NULL AND "asset_model_id" IS NULL) OR ("kind" = 'MATERIAL' AND "material_id" IS NOT NULL AND "asset_model_id" IS NULL AND "capability_id" IS NULL) OR ("kind" = 'ASSET' AND "asset_model_id" IS NOT NULL AND "material_id" IS NULL AND "capability_id" IS NULL) OR ("kind" IN ('VEHICLE','TRANSPORT','DURATION','CRATING') AND "material_id" IS NULL AND "asset_model_id" IS NULL AND "capability_id" IS NULL)),
  CONSTRAINT "service_package_requirements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_requirements_version_fkey" FOREIGN KEY ("tenant_id", "package_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_requirements_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "osi"."material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_requirements_asset_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "osi"."asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_package_requirements_capability_fkey" FOREIGN KEY ("tenant_id", "capability_id") REFERENCES "osi"."operational_capabilities"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_package_requirements_tenant_ref_key" ON "osi"."service_package_requirements"("tenant_id", "requirement_ref");
CREATE UNIQUE INDEX "service_package_requirements_position_key" ON "osi"."service_package_requirements"("tenant_id", "package_version_id", "position");
CREATE INDEX "service_package_requirements_kind_idx" ON "osi"."service_package_requirements"("tenant_id", "package_version_id", "kind");

CREATE TABLE "osi"."service_material_policies" (
  "id" TEXT PRIMARY KEY,
  "policy_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_material_policies_code_check" CHECK ("code" = upper(btrim("code")) AND "code" <> ''),
  CONSTRAINT "service_material_policies_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_material_policies_tenant_id_key" ON "osi"."service_material_policies"("tenant_id", "id");
CREATE UNIQUE INDEX "service_material_policies_tenant_ref_key" ON "osi"."service_material_policies"("tenant_id", "policy_ref");
CREATE UNIQUE INDEX "service_material_policies_tenant_code_key" ON "osi"."service_material_policies"("tenant_id", "code");

CREATE TABLE "osi"."service_material_policy_versions" (
  "id" TEXT PRIMARY KEY,
  "version_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "policy_id" TEXT NOT NULL,
  "package_version_id" TEXT,
  "service_id" TEXT,
  "mode_id" TEXT,
  "version" INTEGER NOT NULL,
  "state" "osi"."ServiceConfigurationState" NOT NULL DEFAULT 'DRAFT',
  "name" VARCHAR(160) NOT NULL,
  "preference_code" VARCHAR(80),
  "standard_code" VARCHAR(80) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "replaces_version_id" TEXT,
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "service_material_policy_versions_values_check" CHECK ("version" > 0 AND btrim("name") <> '' AND btrim("standard_code") <> '' AND ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from") AND (("state" = 'PUBLISHED' AND "published_at" IS NOT NULL) OR "state" <> 'PUBLISHED')),
  CONSTRAINT "service_material_policy_versions_scope_check" CHECK ("package_version_id" IS NOT NULL OR "service_id" IS NOT NULL OR "mode_id" IS NOT NULL),
  CONSTRAINT "service_material_policy_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_versions_policy_fkey" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "osi"."service_material_policies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_versions_package_fkey" FOREIGN KEY ("tenant_id", "package_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_versions_service_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_versions_mode_fkey" FOREIGN KEY ("tenant_id", "mode_id") REFERENCES "osi"."service_mode_definitions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_versions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_material_policy_versions_tenant_id_key" ON "osi"."service_material_policy_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "service_material_policy_versions_tenant_ref_key" ON "osi"."service_material_policy_versions"("tenant_id", "version_ref");
CREATE UNIQUE INDEX "service_material_policy_versions_policy_version_key" ON "osi"."service_material_policy_versions"("tenant_id", "policy_id", "version");
CREATE UNIQUE INDEX "service_material_policy_versions_replaces_key" ON "osi"."service_material_policy_versions"("tenant_id", "replaces_version_id");
CREATE INDEX "service_material_policy_versions_resolve_idx" ON "osi"."service_material_policy_versions"("tenant_id", "state", "mode_id", "service_id", "package_version_id", "valid_from", "valid_to");
ALTER TABLE "osi"."service_material_policy_versions" ADD CONSTRAINT "service_material_policy_versions_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_version_id") REFERENCES "osi"."service_material_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "osi"."service_material_policy_lines" (
  "id" TEXT PRIMARY KEY,
  "line_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "policy_version_id" TEXT NOT NULL,
  "material_id" TEXT,
  "asset_model_id" TEXT,
  "material_class" VARCHAR(80) NOT NULL,
  "disposition" "osi"."ServiceMaterialDisposition" NOT NULL,
  "proportion" DECIMAL(7,4),
  "charge_type" "osi"."ServiceResourceChargeType" NOT NULL,
  "preparation_rule" JSONB NOT NULL DEFAULT '{}',
  "maintenance_rule" JSONB NOT NULL DEFAULT '{}',
  "deterioration_rule" JSONB NOT NULL DEFAULT '{}',
  "replacement_rule" JSONB NOT NULL DEFAULT '{}',
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL,
  CONSTRAINT "service_material_policy_lines_values_check" CHECK ("position" >= 0 AND ("proportion" IS NULL OR ("proportion" >= 0 AND "proportion" <= 1)) AND num_nonnulls("material_id", "asset_model_id") = 1),
  CONSTRAINT "service_material_policy_lines_disposition_check" CHECK (("asset_model_id" IS NULL OR "disposition" <> 'CONSUMED') AND ("disposition" <> 'RENTED' OR "charge_type" IN ('RENTAL','USAGE','INCLUDED'))),
  CONSTRAINT "service_material_policy_lines_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_lines_version_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "osi"."service_material_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_lines_material_fkey" FOREIGN KEY ("tenant_id", "material_id") REFERENCES "osi"."material_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_material_policy_lines_asset_fkey" FOREIGN KEY ("tenant_id", "asset_model_id") REFERENCES "osi"."asset_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_material_policy_lines_tenant_ref_key" ON "osi"."service_material_policy_lines"("tenant_id", "line_ref");
CREATE UNIQUE INDEX "service_material_policy_lines_position_key" ON "osi"."service_material_policy_lines"("tenant_id", "policy_version_id", "position");

CREATE TABLE "osi"."case_service_configuration_revisions" (
  "id" TEXT PRIMARY KEY,
  "configuration_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "mode_code_snapshot" VARCHAR(64) NOT NULL,
  "service_selection_ref" UUID NOT NULL,
  "service_selection_revision" INTEGER NOT NULL,
  "package_version_id" TEXT,
  "package_ref_snapshot" UUID,
  "package_version_snapshot" INTEGER,
  "material_policy_version_id" TEXT,
  "material_policy_ref_snapshot" UUID,
  "material_policy_version_snapshot" INTEGER,
  "survey_publication_ref" UUID,
  "commercial_agreement_ref" UUID,
  "preference_snapshot" JSONB NOT NULL DEFAULT '{}',
  "duration_snapshot" JSONB NOT NULL DEFAULT '{}',
  "precedence_snapshot" JSONB NOT NULL DEFAULT '{}',
  "logical_sha256" CHAR(64) NOT NULL,
  "source" "osi"."CaseServiceConfigurationSource" NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_service_configurations_values_check" CHECK ("revision" > 0 AND "service_selection_revision" > 0 AND "logical_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "case_service_configurations_package_snapshot_check" CHECK (("package_version_id" IS NULL) = ("package_ref_snapshot" IS NULL) AND ("package_version_id" IS NULL) = ("package_version_snapshot" IS NULL)),
  CONSTRAINT "case_service_configurations_policy_snapshot_check" CHECK (("material_policy_version_id" IS NULL) = ("material_policy_ref_snapshot" IS NULL) AND ("material_policy_version_id" IS NULL) = ("material_policy_version_snapshot" IS NULL)),
  CONSTRAINT "case_service_configurations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "case_service_configurations_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "case_service_configurations_package_fkey" FOREIGN KEY ("tenant_id", "package_version_id") REFERENCES "osi"."service_package_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "case_service_configurations_policy_fkey" FOREIGN KEY ("tenant_id", "material_policy_version_id") REFERENCES "osi"."service_material_policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "case_service_configurations_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "case_service_configurations_tenant_id_key" ON "osi"."case_service_configuration_revisions"("tenant_id", "id");
CREATE UNIQUE INDEX "case_service_configurations_tenant_ref_key" ON "osi"."case_service_configuration_revisions"("tenant_id", "configuration_ref");
CREATE UNIQUE INDEX "case_service_configurations_case_revision_key" ON "osi"."case_service_configuration_revisions"("tenant_id", "pipeline_case_id", "revision");
CREATE INDEX "case_service_configurations_case_idx" ON "osi"."case_service_configuration_revisions"("tenant_id", "pipeline_case_id", "created_at" DESC);

CREATE TABLE "osi"."case_service_configuration_items" (
  "id" TEXT PRIMARY KEY,
  "item_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "configuration_id" TEXT NOT NULL,
  "kind" "osi"."CaseServiceConfigurationItemKind" NOT NULL,
  "source" "osi"."ServiceRequirementSource" NOT NULL,
  "authority_ref" UUID,
  "code_snapshot" VARCHAR(80) NOT NULL,
  "name_snapshot" VARCHAR(160) NOT NULL,
  "quantity" DECIMAL(18,6),
  "unit_code" VARCHAR(32),
  "hours" DECIMAL(10,2),
  "days" DECIMAL(10,2),
  "disposition" "osi"."ServiceMaterialDisposition",
  "charge_type" "osi"."ServiceResourceChargeType",
  "proportion" DECIMAL(7,4),
  "details" JSONB NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL,
  CONSTRAINT "case_service_configuration_items_values_check" CHECK ("position" >= 0 AND coalesce("quantity", 0) >= 0 AND coalesce("hours", 0) >= 0 AND coalesce("days", 0) >= 0 AND ("proportion" IS NULL OR ("proportion" >= 0 AND "proportion" <= 1))),
  CONSTRAINT "case_service_configuration_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "case_service_configuration_items_revision_fkey" FOREIGN KEY ("tenant_id", "configuration_id") REFERENCES "osi"."case_service_configuration_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "case_service_configuration_items_tenant_ref_key" ON "osi"."case_service_configuration_items"("tenant_id", "item_ref");
CREATE UNIQUE INDEX "case_service_configuration_items_position_key" ON "osi"."case_service_configuration_items"("tenant_id", "configuration_id", "position");
CREATE INDEX "case_service_configuration_items_kind_idx" ON "osi"."case_service_configuration_items"("tenant_id", "configuration_id", "kind");

CREATE TABLE "osi"."service_configuration_commands" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "target_ref" VARCHAR(191) NOT NULL,
  "resulting_version" INTEGER NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_configuration_commands_values_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$' AND "resulting_version" > 0),
  CONSTRAINT "service_configuration_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_configuration_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_configuration_commands_tenant_request_key" ON "osi"."service_configuration_commands"("tenant_id", "request_id");
CREATE INDEX "service_configuration_commands_target_idx" ON "osi"."service_configuration_commands"("tenant_id", "target_ref", "created_at" DESC);

CREATE TABLE "osi"."service_configuration_audit_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "aggregate_ref" VARCHAR(191) NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot_sha256" CHAR(64) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_configuration_audit_events_values_check" CHECK ("version" > 0 AND "snapshot_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "service_configuration_audit_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_configuration_audit_events_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_configuration_audit_events_tenant_ref_key" ON "osi"."service_configuration_audit_events"("tenant_id", "event_ref");
CREATE INDEX "service_configuration_audit_events_aggregate_idx" ON "osi"."service_configuration_audit_events"("tenant_id", "aggregate_ref", "created_at" DESC);

CREATE TABLE "osi"."service_configuration_conflicts" (
  "id" TEXT PRIMARY KEY,
  "conflict_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "configuration_id" TEXT NOT NULL,
  "kind" VARCHAR(80) NOT NULL,
  "competing_authority_refs" UUID[],
  "state" "osi"."ServiceConfigurationConflictState" NOT NULL DEFAULT 'OPEN',
  "resolution" JSONB,
  "resolved_by_membership_id" TEXT,
  "resolved_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "service_configuration_conflicts_resolution_check" CHECK (("state" = 'OPEN' AND "resolution" IS NULL AND "resolved_at" IS NULL AND "resolved_by_membership_id" IS NULL AND "resolved_by_user_id" IS NULL) OR ("state" = 'RESOLVED' AND "resolution" IS NOT NULL AND "resolved_at" IS NOT NULL AND "resolved_by_membership_id" IS NOT NULL AND "resolved_by_user_id" IS NOT NULL)),
  CONSTRAINT "service_configuration_conflicts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_configuration_conflicts_revision_fkey" FOREIGN KEY ("tenant_id", "configuration_id") REFERENCES "osi"."case_service_configuration_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_configuration_conflicts_resolver_fkey" FOREIGN KEY ("tenant_id", "resolved_by_membership_id", "resolved_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_configuration_conflicts_tenant_ref_key" ON "osi"."service_configuration_conflicts"("tenant_id", "conflict_ref");
CREATE INDEX "service_configuration_conflicts_state_idx" ON "osi"."service_configuration_conflicts"("tenant_id", "state", "created_at");

CREATE OR REPLACE FUNCTION "osi"."service_configuration_public_ref_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN RAISE EXCEPTION 'service tenant identity is immutable' USING ERRCODE = '23514'; END IF;
  IF to_jsonb(NEW) ? 'mode_ref' AND NEW."mode_ref" IS DISTINCT FROM OLD."mode_ref" THEN RAISE EXCEPTION 'service public identity is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "osi"."service_configuration_version_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'published service history is append-only' USING ERRCODE = '23514'; END IF;
  IF OLD."state" = 'PUBLISHED' AND NEW."state" <> 'INACTIVE' THEN RAISE EXCEPTION 'published service version is immutable' USING ERRCODE = '23514'; END IF;
  IF OLD."state" = 'PUBLISHED' AND (to_jsonb(NEW) - ARRAY['state','updated_at']::text[]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','updated_at']::text[]) THEN RAISE EXCEPTION 'published service version is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "osi"."service_configuration_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service configuration history is append-only' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "service_package_versions_immutable" BEFORE UPDATE OR DELETE ON "osi"."service_package_versions" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_version_guard"();
CREATE TRIGGER "service_material_policy_versions_immutable" BEFORE UPDATE OR DELETE ON "osi"."service_material_policy_versions" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_version_guard"();
CREATE TRIGGER "case_service_configuration_revisions_append_only" BEFORE UPDATE OR DELETE ON "osi"."case_service_configuration_revisions" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_append_only"();
CREATE TRIGGER "case_service_configuration_items_append_only" BEFORE UPDATE OR DELETE ON "osi"."case_service_configuration_items" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_append_only"();
CREATE TRIGGER "service_configuration_commands_append_only" BEFORE UPDATE OR DELETE ON "osi"."service_configuration_commands" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_append_only"();
CREATE TRIGGER "service_configuration_audit_events_append_only" BEFORE UPDATE OR DELETE ON "osi"."service_configuration_audit_events" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_append_only"();

-- Public references are stable; row IDs stay server-side only.
CREATE OR REPLACE FUNCTION "osi"."service_configuration_ref_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id" THEN RAISE EXCEPTION 'service tenant identity is immutable' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW)->>'mode_ref') IS DISTINCT FROM (to_jsonb(OLD)->>'mode_ref')
    OR (to_jsonb(NEW)->>'package_ref') IS DISTINCT FROM (to_jsonb(OLD)->>'package_ref')
    OR (to_jsonb(NEW)->>'policy_ref') IS DISTINCT FROM (to_jsonb(OLD)->>'policy_ref') THEN
    RAISE EXCEPTION 'service public identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "service_mode_definitions_ref_immutable" BEFORE UPDATE ON "osi"."service_mode_definitions" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_ref_guard"();
CREATE TRIGGER "service_packages_ref_immutable" BEFORE UPDATE ON "osi"."service_packages" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_ref_guard"();
CREATE TRIGGER "service_material_policies_ref_immutable" BEFORE UPDATE ON "osi"."service_material_policies" FOR EACH ROW EXECUTE FUNCTION "osi"."service_configuration_ref_guard"();
