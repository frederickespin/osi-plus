-- DB-01J: versioned crate/crating/nesting settings and historical calculation snapshots.
-- Experimental local chain only. No active endpoint or legacy integration is changed.

CREATE TABLE "osi"."crate_settings_versions" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "series_id" text NOT NULL,
  "code" varchar(80) NOT NULL,
  "normalized_code" varchar(80) NOT NULL,
  "name" varchar(180) NOT NULL,
  "scope" varchar(120) NOT NULL,
  "schema_version" integer NOT NULL,
  "business_version" integer NOT NULL,
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "operation_mode" "osi"."LogisticsOperationMode" NOT NULL DEFAULT 'LEGACY_ONLY',
  "technical_json" jsonb NOT NULL,
  "economic_json" jsonb NOT NULL,
  "catalog_refs_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "units_json" jsonb NOT NULL,
  "currency_code" char(3) NOT NULL,
  "configuration_json" jsonb NOT NULL,
  "configuration_hash" char(64) NOT NULL,
  "version_hash" char(64) NOT NULL,
  "valid_from" timestamptz(3),
  "valid_to" timestamptz(3),
  "replaces_settings_id" text,
  "source" varchar(120) NOT NULL,
  "evidence_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" text NOT NULL,
  "created_by_membership_id" text NOT NULL,
  "approved_by_user_id" text,
  "approved_by_membership_id" text,
  "approved_at" timestamptz(3),
  "activated_at" timestamptz(3),
  "retired_at" timestamptz(3),
  "request_id" varchar(191) NOT NULL,
  "payload_hash" char(64) NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crate_settings_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crate_settings_versions_version_check" CHECK ("schema_version" > 0 AND "business_version" > 0),
  CONSTRAINT "crate_settings_versions_currency_check" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  CONSTRAINT "crate_settings_versions_json_check" CHECK (
    jsonb_typeof("technical_json") = 'object' AND jsonb_typeof("economic_json") = 'object'
    AND jsonb_typeof("catalog_refs_json") = 'array' AND jsonb_typeof("units_json") = 'object'
    AND jsonb_typeof("configuration_json") = 'object' AND jsonb_typeof("evidence_json") = 'object'
  ),
  CONSTRAINT "crate_settings_versions_hash_check" CHECK (
    "configuration_hash" ~ '^[0-9a-f]{64}$' AND "version_hash" ~ '^[0-9a-f]{64}$' AND "payload_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "crate_settings_versions_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "crate_settings_versions_approver_pair_check" CHECK (
    ("approved_by_user_id" IS NULL) = ("approved_by_membership_id" IS NULL)
    AND ("approved_at" IS NULL) = ("approved_by_membership_id" IS NULL)
  ),
  CONSTRAINT "crate_settings_versions_separation_check" CHECK (
    "approved_by_membership_id" IS NULL OR "approved_by_membership_id" <> "created_by_membership_id"
  ),
  CONSTRAINT "crate_settings_versions_activation_check" CHECK (
    "state" NOT IN ('SHADOW', 'ACTIVE') OR "approved_at" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "crate_settings_versions_tenant_id_id_key" ON "osi"."crate_settings_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "crate_settings_versions_tenant_code_version_key" ON "osi"."crate_settings_versions"("tenant_id", "normalized_code", "business_version");
CREATE UNIQUE INDEX "crate_settings_versions_tenant_series_version_key" ON "osi"."crate_settings_versions"("tenant_id", "series_id", "business_version");
CREATE UNIQUE INDEX "crate_settings_versions_tenant_version_hash_key" ON "osi"."crate_settings_versions"("tenant_id", "version_hash");
CREATE UNIQUE INDEX "crate_settings_versions_tenant_request_key" ON "osi"."crate_settings_versions"("tenant_id", "request_id");
CREATE UNIQUE INDEX "crate_settings_versions_one_active_scope_key" ON "osi"."crate_settings_versions"("tenant_id", "scope") WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "crate_settings_versions_one_shadow_scope_key" ON "osi"."crate_settings_versions"("tenant_id", "scope") WHERE "state" = 'SHADOW';
CREATE INDEX "crate_settings_versions_resolve_idx" ON "osi"."crate_settings_versions"("tenant_id", "scope", "state", "valid_from", "valid_to");

CREATE TABLE "osi"."crate_calculation_snapshots" (
  "id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "calculation_ref" varchar(191) NOT NULL,
  "source_entity" varchar(80) NOT NULL,
  "source_entity_id" varchar(191) NOT NULL,
  "settings_id" text NOT NULL,
  "settings_business_version" integer NOT NULL,
  "settings_hash" char(64) NOT NULL,
  "technical_snapshot_json" jsonb NOT NULL,
  "economic_snapshot_json" jsonb NOT NULL,
  "units_snapshot_json" jsonb NOT NULL,
  "currency_code" char(3) NOT NULL,
  "calculation_input_hash" char(64) NOT NULL,
  "calculation_output_hash" char(64) NOT NULL,
  "source" varchar(120) NOT NULL,
  "created_by_user_id" text,
  "created_by_membership_id" text,
  "request_id" varchar(191) NOT NULL,
  "created_at" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crate_calculation_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crate_calculation_snapshots_version_check" CHECK ("settings_business_version" > 0),
  CONSTRAINT "crate_calculation_snapshots_currency_check" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  CONSTRAINT "crate_calculation_snapshots_json_check" CHECK (
    jsonb_typeof("technical_snapshot_json") = 'object' AND jsonb_typeof("economic_snapshot_json") = 'object'
    AND jsonb_typeof("units_snapshot_json") = 'object'
  ),
  CONSTRAINT "crate_calculation_snapshots_hash_check" CHECK (
    "settings_hash" ~ '^[0-9a-f]{64}$' AND "calculation_input_hash" ~ '^[0-9a-f]{64}$'
    AND "calculation_output_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "crate_calculation_snapshots_actor_pair_check" CHECK (
    ("created_by_user_id" IS NULL) = ("created_by_membership_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "crate_calculation_snapshots_tenant_id_id_key" ON "osi"."crate_calculation_snapshots"("tenant_id", "id");
CREATE UNIQUE INDEX "crate_calculation_snapshots_tenant_ref_key" ON "osi"."crate_calculation_snapshots"("tenant_id", "calculation_ref");
CREATE UNIQUE INDEX "crate_calculation_snapshots_tenant_request_key" ON "osi"."crate_calculation_snapshots"("tenant_id", "request_id");
CREATE INDEX "crate_calculation_snapshots_settings_idx" ON "osi"."crate_calculation_snapshots"("tenant_id", "settings_id", "created_at" DESC);
CREATE INDEX "crate_calculation_snapshots_entity_idx" ON "osi"."crate_calculation_snapshots"("tenant_id", "source_entity", "source_entity_id", "created_at" DESC);

ALTER TABLE "osi"."crate_settings_versions"
  ADD CONSTRAINT "crate_settings_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "crate_settings_versions_creator_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "crate_settings_versions_approver_fkey" FOREIGN KEY ("tenant_id", "approved_by_membership_id", "approved_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "crate_settings_versions_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_settings_id") REFERENCES "osi"."crate_settings_versions"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "osi"."crate_calculation_snapshots"
  ADD CONSTRAINT "crate_calculation_snapshots_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "crate_calculation_snapshots_settings_fkey" FOREIGN KEY ("tenant_id", "settings_id") REFERENCES "osi"."crate_settings_versions"("tenant_id", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "crate_calculation_snapshots_actor_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION "osi"."db01j_forbid_crate_settings_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DB01J_CRATE_SETTINGS_DELETE_FORBIDDEN' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "crate_settings_versions_no_delete"
BEFORE DELETE ON "osi"."crate_settings_versions"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_forbid_crate_settings_delete"();

CREATE OR REPLACE FUNCTION "osi"."db01j_crate_settings_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" IN ('SHADOW', 'ACTIVE', 'RETIRED') AND ROW(
    NEW."tenant_id", NEW."series_id", NEW."code", NEW."normalized_code", NEW."name", NEW."scope",
    NEW."schema_version", NEW."business_version", NEW."operation_mode", NEW."technical_json", NEW."economic_json",
    NEW."catalog_refs_json", NEW."units_json", NEW."currency_code", NEW."configuration_json", NEW."configuration_hash",
    NEW."version_hash", NEW."valid_from", NEW."valid_to", NEW."replaces_settings_id", NEW."source", NEW."evidence_json",
    NEW."created_by_user_id", NEW."created_by_membership_id", NEW."request_id", NEW."payload_hash", NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."tenant_id", OLD."series_id", OLD."code", OLD."normalized_code", OLD."name", OLD."scope",
    OLD."schema_version", OLD."business_version", OLD."operation_mode", OLD."technical_json", OLD."economic_json",
    OLD."catalog_refs_json", OLD."units_json", OLD."currency_code", OLD."configuration_json", OLD."configuration_hash",
    OLD."version_hash", OLD."valid_from", OLD."valid_to", OLD."replaces_settings_id", OLD."source", OLD."evidence_json",
    OLD."created_by_user_id", OLD."created_by_membership_id", OLD."request_id", OLD."payload_hash", OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'DB01J_ACTIVE_CRATE_SETTINGS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "crate_settings_versions_immutable"
BEFORE UPDATE ON "osi"."crate_settings_versions"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_crate_settings_immutable"();

CREATE OR REPLACE FUNCTION "osi"."db01j_forbid_crate_snapshot_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DB01J_CRATE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "crate_calculation_snapshots_no_update"
BEFORE UPDATE ON "osi"."crate_calculation_snapshots"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_forbid_crate_snapshot_change"();

CREATE TRIGGER "crate_calculation_snapshots_no_delete"
BEFORE DELETE ON "osi"."crate_calculation_snapshots"
FOR EACH ROW EXECUTE FUNCTION "osi"."db01j_forbid_crate_snapshot_change"();
