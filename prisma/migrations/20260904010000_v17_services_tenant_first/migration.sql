-- V17-SERVICES-TENANT-FIRST-03A
-- Additive tenant-first service catalog and append-only case selections.

CREATE TYPE "osi"."ServiceCatalogUsage" AS ENUM ('PRIMARY', 'COMPLEMENTARY', 'BOTH');
CREATE TYPE "osi"."ServiceCatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "osi"."CaseServiceSelectionSource" AS ENUM ('MANUAL', 'DEFAULT_COMBINATION');
CREATE TYPE "osi"."CaseServiceItemKind" AS ENUM ('PRIMARY', 'COMPLEMENTARY', 'OTHER');
CREATE TYPE "osi"."CaseServiceItemSource" AS ENUM ('MANUAL', 'DEFAULT', 'OTHER');
CREATE TYPE "osi"."ServiceClassificationStatus" AS ENUM ('PENDING');

CREATE TABLE "osi"."service_catalog_items" (
  "id" TEXT NOT NULL,
  "service_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80),
  "usage" "osi"."ServiceCatalogUsage" NOT NULL,
  "compatible_modes" "osi"."PipelineMode"[] NOT NULL DEFAULT ARRAY[]::"osi"."PipelineMode"[],
  "status" "osi"."ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_catalog_items_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "service_catalog_items_name_check" CHECK (btrim("name") = "name" AND length("name") BETWEEN 1 AND 160),
  CONSTRAINT "service_catalog_items_modes_check" CHECK (
    ("usage" = 'COMPLEMENTARY' AND cardinality("compatible_modes") >= 0)
    OR ("usage" IN ('PRIMARY','BOTH') AND cardinality("compatible_modes") >= 1)
  ),
  CONSTRAINT "service_catalog_items_version_check" CHECK ("version" >= 1),
  CONSTRAINT "service_catalog_items_sort_order_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "service_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_catalog_items_tenant_id_id_key" ON "osi"."service_catalog_items"("tenant_id", "id");
CREATE UNIQUE INDEX "service_catalog_items_tenant_service_ref_key" ON "osi"."service_catalog_items"("tenant_id", "service_ref");
CREATE UNIQUE INDEX "service_catalog_items_tenant_code_key" ON "osi"."service_catalog_items"("tenant_id", "code");
CREATE INDEX "service_catalog_items_tenant_usage_status_order_idx" ON "osi"."service_catalog_items"("tenant_id", "usage", "status", "sort_order");

CREATE TABLE "osi"."service_catalog_compatibilities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "primary_service_id" TEXT NOT NULL,
  "complementary_service_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_catalog_compatibilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_catalog_compatibilities_distinct_check" CHECK ("primary_service_id" <> "complementary_service_id"),
  CONSTRAINT "service_catalog_compatibilities_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_catalog_compatibilities_primary_fkey" FOREIGN KEY ("tenant_id", "primary_service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_catalog_compatibilities_complementary_fkey" FOREIGN KEY ("tenant_id", "complementary_service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_catalog_compatibilities_unique" ON "osi"."service_catalog_compatibilities"("tenant_id", "primary_service_id", "complementary_service_id");
CREATE INDEX "service_catalog_compatibilities_complementary_idx" ON "osi"."service_catalog_compatibilities"("tenant_id", "complementary_service_id");

CREATE TABLE "osi"."service_default_combinations" (
  "id" TEXT NOT NULL,
  "combination_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "primary_service_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "osi"."ServiceCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_default_combinations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_default_combinations_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "service_default_combinations_version_check" CHECK ("version" >= 1),
  CONSTRAINT "service_default_combinations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_default_combinations_primary_fkey" FOREIGN KEY ("tenant_id", "primary_service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_default_combinations_tenant_id_id_key" ON "osi"."service_default_combinations"("tenant_id", "id");
CREATE UNIQUE INDEX "service_default_combinations_tenant_ref_key" ON "osi"."service_default_combinations"("tenant_id", "combination_ref");
CREATE UNIQUE INDEX "service_default_combinations_tenant_code_key" ON "osi"."service_default_combinations"("tenant_id", "code");
CREATE UNIQUE INDEX "service_default_combinations_one_default_key" ON "osi"."service_default_combinations"("tenant_id", "primary_service_id") WHERE "is_default" = true AND "status" = 'ACTIVE';
CREATE INDEX "service_default_combinations_primary_status_idx" ON "osi"."service_default_combinations"("tenant_id", "primary_service_id", "status");

CREATE TABLE "osi"."service_default_combination_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "combination_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "service_default_combination_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_default_combination_items_position_check" CHECK ("position" >= 0),
  CONSTRAINT "service_default_combination_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_default_combination_items_combination_fkey" FOREIGN KEY ("tenant_id", "combination_id") REFERENCES "osi"."service_default_combinations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_default_combination_items_service_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_default_combination_items_service_key" ON "osi"."service_default_combination_items"("tenant_id", "combination_id", "service_id");
CREATE UNIQUE INDEX "service_default_combination_items_position_key" ON "osi"."service_default_combination_items"("tenant_id", "combination_id", "position");

CREATE TABLE "osi"."pipeline_case_service_revisions" (
  "id" TEXT NOT NULL,
  "selection_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "mode_snapshot" "osi"."PipelineMode" NOT NULL,
  "source" "osi"."CaseServiceSelectionSource" NOT NULL,
  "default_combination_ref" UUID,
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_service_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_case_service_revisions_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "pipeline_case_service_revisions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pipeline_case_service_revisions_case_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pipeline_case_service_revisions_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pipeline_case_service_revisions_tenant_id_id_key" ON "osi"."pipeline_case_service_revisions"("tenant_id", "id");
CREATE UNIQUE INDEX "pipeline_case_service_revisions_tenant_ref_key" ON "osi"."pipeline_case_service_revisions"("tenant_id", "selection_ref");
CREATE UNIQUE INDEX "pipeline_case_service_revisions_case_revision_key" ON "osi"."pipeline_case_service_revisions"("tenant_id", "pipeline_case_id", "revision");
CREATE INDEX "pipeline_case_service_revisions_case_created_idx" ON "osi"."pipeline_case_service_revisions"("tenant_id", "pipeline_case_id", "created_at" DESC);

CREATE TABLE "osi"."pipeline_case_service_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "service_id" TEXT,
  "kind" "osi"."CaseServiceItemKind" NOT NULL,
  "source" "osi"."CaseServiceItemSource" NOT NULL,
  "position" INTEGER NOT NULL,
  "service_ref_snapshot" UUID,
  "code_snapshot" VARCHAR(64) NOT NULL,
  "name_snapshot" VARCHAR(320) NOT NULL,
  "category_snapshot" VARCHAR(80),
  "catalog_version_snapshot" INTEGER,
  "classification_status" "osi"."ServiceClassificationStatus",
  CONSTRAINT "pipeline_case_service_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_case_service_items_position_check" CHECK ("position" >= 0),
  CONSTRAINT "pipeline_case_service_items_shape_check" CHECK (
    ("kind" = 'OTHER' AND "service_id" IS NULL AND "service_ref_snapshot" IS NULL AND "code_snapshot" = 'OTHER' AND "classification_status" = 'PENDING' AND "source" = 'OTHER' AND length(btrim("name_snapshot")) BETWEEN 3 AND 320)
    OR ("kind" <> 'OTHER' AND "service_id" IS NOT NULL AND "service_ref_snapshot" IS NOT NULL AND "catalog_version_snapshot" >= 1 AND "classification_status" IS NULL)
  ),
  CONSTRAINT "pipeline_case_service_items_primary_position_check" CHECK (("kind" = 'PRIMARY' AND "position" = 0) OR ("kind" <> 'PRIMARY' AND "position" > 0)),
  CONSTRAINT "pipeline_case_service_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pipeline_case_service_items_revision_fkey" FOREIGN KEY ("tenant_id", "revision_id") REFERENCES "osi"."pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pipeline_case_service_items_service_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "osi"."service_catalog_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pipeline_case_service_items_position_key" ON "osi"."pipeline_case_service_items"("tenant_id", "revision_id", "position");
CREATE UNIQUE INDEX "pipeline_case_service_items_service_key" ON "osi"."pipeline_case_service_items"("tenant_id", "revision_id", "service_id");
CREATE UNIQUE INDEX "pipeline_case_service_items_one_primary_key" ON "osi"."pipeline_case_service_items"("tenant_id", "revision_id") WHERE "kind" = 'PRIMARY';
CREATE INDEX "pipeline_case_service_items_service_idx" ON "osi"."pipeline_case_service_items"("tenant_id", "service_id");

CREATE TABLE "osi"."service_mutation_commands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "target_ref" VARCHAR(191) NOT NULL,
  "resulting_version" INTEGER NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_mutation_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_mutation_commands_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "service_mutation_commands_version_check" CHECK ("resulting_version" >= 1),
  CONSTRAINT "service_mutation_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_mutation_commands_actor_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_mutation_commands_tenant_request_key" ON "osi"."service_mutation_commands"("tenant_id", "request_id");
CREATE INDEX "service_mutation_commands_target_idx" ON "osi"."service_mutation_commands"("tenant_id", "target_ref", "created_at" DESC);

CREATE OR REPLACE FUNCTION "osi"."v17_services_validate_relations"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE primary_usage "osi"."ServiceCatalogUsage";
DECLARE complementary_usage "osi"."ServiceCatalogUsage";
BEGIN
  IF TG_TABLE_NAME = 'service_catalog_compatibilities' THEN
    SELECT "usage" INTO primary_usage FROM "osi"."service_catalog_items" WHERE "tenant_id"=NEW."tenant_id" AND "id"=NEW."primary_service_id";
    SELECT "usage" INTO complementary_usage FROM "osi"."service_catalog_items" WHERE "tenant_id"=NEW."tenant_id" AND "id"=NEW."complementary_service_id";
  ELSE
    SELECT s."usage" INTO primary_usage FROM "osi"."service_default_combinations" c JOIN "osi"."service_catalog_items" s ON s."tenant_id"=c."tenant_id" AND s."id"=c."primary_service_id" WHERE c."tenant_id"=NEW."tenant_id" AND c."id"=NEW."combination_id";
    SELECT "usage" INTO complementary_usage FROM "osi"."service_catalog_items" WHERE "tenant_id"=NEW."tenant_id" AND "id"=NEW."service_id";
    IF NOT EXISTS (SELECT 1 FROM "osi"."service_catalog_compatibilities" x JOIN "osi"."service_default_combinations" c ON c."tenant_id"=x."tenant_id" AND c."primary_service_id"=x."primary_service_id" WHERE c."tenant_id"=NEW."tenant_id" AND c."id"=NEW."combination_id" AND x."complementary_service_id"=NEW."service_id") THEN
      RAISE EXCEPTION 'SERVICE_COMPLEMENTARY_NOT_ALLOWED' USING ERRCODE='23514';
    END IF;
  END IF;
  IF primary_usage NOT IN ('PRIMARY','BOTH') OR complementary_usage NOT IN ('COMPLEMENTARY','BOTH') THEN
    RAISE EXCEPTION 'SERVICE_USAGE_INCOMPATIBLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "service_compatibility_validate" BEFORE INSERT OR UPDATE ON "osi"."service_catalog_compatibilities" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_services_validate_relations"();
CREATE TRIGGER "service_default_item_validate" BEFORE INSERT OR UPDATE ON "osi"."service_default_combination_items" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_services_validate_relations"();

CREATE OR REPLACE FUNCTION "osi"."v17_services_immutable_identity"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."service_ref" IS DISTINCT FROM NEW."service_ref" OR OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id" OR OLD."code" IS DISTINCT FROM NEW."code" THEN
    RAISE EXCEPTION 'SERVICE_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "service_catalog_identity_immutable" BEFORE UPDATE ON "osi"."service_catalog_items" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_services_immutable_identity"();

CREATE OR REPLACE FUNCTION "osi"."v17_case_service_snapshot_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CASE_SERVICE_SNAPSHOT_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "case_service_revision_immutable" BEFORE UPDATE OR DELETE ON "osi"."pipeline_case_service_revisions" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_case_service_snapshot_immutable"();
CREATE TRIGGER "case_service_item_immutable" BEFORE UPDATE OR DELETE ON "osi"."pipeline_case_service_items" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_case_service_snapshot_immutable"();

CREATE OR REPLACE FUNCTION "osi"."v17_service_public_refs_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."combination_ref" IS DISTINCT FROM NEW."combination_ref" OR OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id" OR OLD."code" IS DISTINCT FROM NEW."code" THEN
    RAISE EXCEPTION 'SERVICE_COMBINATION_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "service_default_identity_immutable" BEFORE UPDATE ON "osi"."service_default_combinations" FOR EACH ROW EXECUTE FUNCTION "osi"."v17_service_public_refs_immutable"();
