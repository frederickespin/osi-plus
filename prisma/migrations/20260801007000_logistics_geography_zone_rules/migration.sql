-- DB-01H. Geografía y reglas logísticas multiempresa/versionadas.
-- Cadena experimental local posterior a DB-01G. No activa rutas ni importa datos.

CREATE TYPE "osi"."LogisticsConfigState" AS ENUM ('DRAFT','SHADOW','ACTIVE','RETIRED');
CREATE TYPE "osi"."LogisticsOperationMode" AS ENUM ('LEGACY_ONLY','SHADOW','ENFORCED');
CREATE TYPE "osi"."GeoRegionAliasKind" AS ENUM ('CANONICAL','HISTORICAL','TYPO_COMPATIBILITY','EXTERNAL');
CREATE TYPE "osi"."ZoneRuleKind" AS ENUM (
  'ZONE_TYPE_BASE','REGION_OVERRIDE','DISTANCE_REVIEW','DISTANCE_BLOCK','ROUTE_SURCHARGE'
);
CREATE TYPE "osi"."TransportRuleScope" AS ENUM ('ZONE_TYPE','REGION','ROUTE','DISTANCE_BAND');

CREATE TABLE "osi"."logistics_configuration_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "mode" "osi"."LogisticsOperationMode" NOT NULL DEFAULT 'LEGACY_ONLY',
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "source" VARCHAR(120) NOT NULL,
  "source_snapshot_json" JSONB NOT NULL,
  "source_hash" CHAR(64) NOT NULL,
  "config_hash" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_by_membership_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "retired_at" TIMESTAMP(3),
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_configuration_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistics_configuration_versions_tenant_id_key" UNIQUE ("tenant_id","id"),
  CONSTRAINT "logistics_configuration_versions_tenant_version_key" UNIQUE ("tenant_id","version"),
  CONSTRAINT "logistics_configuration_versions_tenant_request_key" UNIQUE ("tenant_id","request_id"),
  CONSTRAINT "logistics_configuration_versions_tenant_hash_key" UNIQUE ("tenant_id","config_hash"),
  CONSTRAINT "logistics_configuration_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "logistics_configuration_versions_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "logistics_configuration_versions_snapshot_check" CHECK (jsonb_typeof("source_snapshot_json")='object'),
  CONSTRAINT "logistics_configuration_versions_evidence_check" CHECK (jsonb_typeof("evidence_refs_json")='array'),
  CONSTRAINT "logistics_configuration_versions_approver_pair" CHECK (("approved_by_user_id" IS NULL)=("approved_by_membership_id" IS NULL)),
  CONSTRAINT "logistics_configuration_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "logistics_configuration_versions_creator_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id","created_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "logistics_configuration_versions_approver_fkey" FOREIGN KEY ("tenant_id","approved_by_membership_id","approved_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "logistics_configuration_versions_one_active_idx"
  ON "osi"."logistics_configuration_versions"("tenant_id") WHERE "state"='ACTIVE';
CREATE INDEX "logistics_configuration_versions_tenant_state_idx"
  ON "osi"."logistics_configuration_versions"("tenant_id","state","valid_from","valid_to");

CREATE TABLE "osi"."osi_geo_regions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "normalized_code" VARCHAR(120) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "normalized_name" VARCHAR(200) NOT NULL,
  "administrative_division" VARCHAR(160),
  "region_type" VARCHAR(80) NOT NULL,
  "zone_type" VARCHAR(80) NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "sla_hours" INTEGER,
  "geography_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "aliases_snapshot_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "version_hash" CHAR(64) NOT NULL,
  "replaces_region_id" TEXT,
  "source" VARCHAR(120) NOT NULL,
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_by_membership_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "retired_at" TIMESTAMP(3),
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_geo_regions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_geo_regions_tenant_id_key" UNIQUE ("tenant_id","id"),
  CONSTRAINT "osi_geo_regions_tenant_series_version_key" UNIQUE ("tenant_id","series_id","version"),
  CONSTRAINT "osi_geo_regions_tenant_request_key" UNIQUE ("tenant_id","request_id"),
  CONSTRAINT "osi_geo_regions_tenant_hash_key" UNIQUE ("tenant_id","version_hash"),
  CONSTRAINT "osi_geo_regions_version_check" CHECK ("version">=1),
  CONSTRAINT "osi_geo_regions_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "osi_geo_regions_sla_check" CHECK ("sla_hours" IS NULL OR "sla_hours">0),
  CONSTRAINT "osi_geo_regions_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  CONSTRAINT "osi_geo_regions_geo_check" CHECK (jsonb_typeof("geography_json")='object'),
  CONSTRAINT "osi_geo_regions_aliases_check" CHECK (jsonb_typeof("aliases_snapshot_json")='array'),
  CONSTRAINT "osi_geo_regions_evidence_check" CHECK (jsonb_typeof("evidence_refs_json")='array'),
  CONSTRAINT "osi_geo_regions_approver_pair" CHECK (("approved_by_user_id" IS NULL)=("approved_by_membership_id" IS NULL)),
  CONSTRAINT "osi_geo_regions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "osi_geo_regions_creator_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id","created_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_geo_regions_approver_fkey" FOREIGN KEY ("tenant_id","approved_by_membership_id","approved_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_geo_regions_replaces_fkey" FOREIGN KEY ("tenant_id","replaces_region_id")
    REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "osi_geo_regions_one_active_series_idx" ON "osi"."osi_geo_regions"("tenant_id","series_id") WHERE "state"='ACTIVE';
CREATE UNIQUE INDEX "osi_geo_regions_one_active_code_idx" ON "osi"."osi_geo_regions"("tenant_id","country_code","normalized_code") WHERE "state"='ACTIVE';
CREATE INDEX "osi_geo_regions_lookup_idx" ON "osi"."osi_geo_regions"("tenant_id","country_code","state","normalized_name");
CREATE INDEX "osi_geo_regions_zone_idx" ON "osi"."osi_geo_regions"("tenant_id","zone_type","state");

CREATE TABLE "osi"."osi_geo_region_aliases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "region_id" TEXT NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "alias" VARCHAR(180) NOT NULL,
  "normalized_alias" VARCHAR(200) NOT NULL,
  "kind" "osi"."GeoRegionAliasKind" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_geo_region_aliases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_geo_region_aliases_tenant_region_alias_key" UNIQUE ("tenant_id","region_id","normalized_alias"),
  CONSTRAINT "osi_geo_region_aliases_region_fkey" FOREIGN KEY ("tenant_id","region_id")
    REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT
);
CREATE INDEX "osi_geo_region_aliases_lookup_idx" ON "osi"."osi_geo_region_aliases"("tenant_id","country_code","normalized_alias");

CREATE TABLE "osi"."osi_zone_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "kind" "osi"."ZoneRuleKind" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "scope_key" VARCHAR(300) NOT NULL,
  "country_code" CHAR(2),
  "zone_type" VARCHAR(80),
  "region_id" TEXT,
  "origin_region_id" TEXT,
  "destination_region_id" TEXT,
  "distance_min_km" DECIMAL(12,3),
  "distance_max_km" DECIMAL(12,3),
  "free_km" DECIMAL(12,3),
  "km_rate" DECIMAL(18,4),
  "surcharge_percent" DECIMAL(9,4),
  "sla_hours" INTEGER,
  "weekend_surcharge_percent" DECIMAL(9,4),
  "after_hours_surcharge_percent" DECIMAL(9,4),
  "result_hash" CHAR(64) NOT NULL,
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "version_hash" CHAR(64) NOT NULL,
  "replaces_rule_id" TEXT,
  "risk_rule_id" TEXT,
  "risk_rule_hash" CHAR(64),
  "source" VARCHAR(120) NOT NULL,
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_by_membership_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "retired_at" TIMESTAMP(3),
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_zone_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_zone_rules_tenant_id_key" UNIQUE ("tenant_id","id"),
  CONSTRAINT "osi_zone_rules_tenant_series_version_key" UNIQUE ("tenant_id","series_id","version"),
  CONSTRAINT "osi_zone_rules_tenant_code_version_key" UNIQUE ("tenant_id","code","version"),
  CONSTRAINT "osi_zone_rules_tenant_request_key" UNIQUE ("tenant_id","request_id"),
  CONSTRAINT "osi_zone_rules_tenant_hash_key" UNIQUE ("tenant_id","version_hash"),
  CONSTRAINT "osi_zone_rules_distance_check" CHECK ("distance_min_km" IS NULL OR "distance_max_km" IS NULL OR "distance_max_km">="distance_min_km"),
  CONSTRAINT "osi_zone_rules_values_check" CHECK (COALESCE("free_km",0)>=0 AND COALESCE("km_rate",0)>=0 AND COALESCE("sla_hours",1)>0),
  CONSTRAINT "osi_zone_rules_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  CONSTRAINT "osi_zone_rules_approver_pair" CHECK (("approved_by_user_id" IS NULL)=("approved_by_membership_id" IS NULL)),
  CONSTRAINT "osi_zone_rules_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_creator_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id","created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_approver_fkey" FOREIGN KEY ("tenant_id","approved_by_membership_id","approved_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_region_fkey" FOREIGN KEY ("tenant_id","region_id") REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_origin_fkey" FOREIGN KEY ("tenant_id","origin_region_id") REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_destination_fkey" FOREIGN KEY ("tenant_id","destination_region_id") REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_replaces_fkey" FOREIGN KEY ("tenant_id","replaces_rule_id") REFERENCES "osi"."osi_zone_rules"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_zone_rules_risk_fkey" FOREIGN KEY ("tenant_id","risk_rule_id") REFERENCES "osi"."risk_engine_rules"("tenant_id","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "osi_zone_rules_one_active_series_idx" ON "osi"."osi_zone_rules"("tenant_id","series_id") WHERE "state"='ACTIVE';
CREATE UNIQUE INDEX "osi_zone_rules_one_active_code_idx" ON "osi"."osi_zone_rules"("tenant_id","code") WHERE "state"='ACTIVE';
CREATE INDEX "osi_zone_rules_resolve_idx" ON "osi"."osi_zone_rules"("tenant_id","state","kind","scope_key","priority","valid_from","valid_to");

CREATE TABLE "osi"."osi_transport_zone_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "series_id" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "scope" "osi"."TransportRuleScope" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "scope_key" VARCHAR(300) NOT NULL,
  "country_code" CHAR(2),
  "service_mode" VARCHAR(80),
  "zone_type" VARCHAR(80),
  "origin_region_id" TEXT,
  "destination_region_id" TEXT,
  "distance_min_km" DECIMAL(12,3),
  "distance_max_km" DECIMAL(12,3),
  "km_multiplier" DECIMAL(12,6) NOT NULL DEFAULT 1,
  "volume_multiplier" DECIMAL(12,6) NOT NULL DEFAULT 1,
  "surcharge_percent" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "minimum_charge" DECIMAL(18,2),
  "result_hash" CHAR(64) NOT NULL,
  "state" "osi"."LogisticsConfigState" NOT NULL DEFAULT 'DRAFT',
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "version_hash" CHAR(64) NOT NULL,
  "replaces_rule_id" TEXT,
  "risk_rule_id" TEXT,
  "risk_rule_hash" CHAR(64),
  "source" VARCHAR(120) NOT NULL,
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_by_membership_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "retired_at" TIMESTAMP(3),
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_transport_zone_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "osi_transport_zone_rules_tenant_id_key" UNIQUE ("tenant_id","id"),
  CONSTRAINT "osi_transport_zone_rules_tenant_series_version_key" UNIQUE ("tenant_id","series_id","version"),
  CONSTRAINT "osi_transport_zone_rules_tenant_code_version_key" UNIQUE ("tenant_id","code","version"),
  CONSTRAINT "osi_transport_zone_rules_tenant_request_key" UNIQUE ("tenant_id","request_id"),
  CONSTRAINT "osi_transport_zone_rules_tenant_hash_key" UNIQUE ("tenant_id","version_hash"),
  CONSTRAINT "osi_transport_zone_rules_distance_check" CHECK ("distance_min_km" IS NULL OR "distance_max_km" IS NULL OR "distance_max_km">="distance_min_km"),
  CONSTRAINT "osi_transport_zone_rules_values_check" CHECK ("km_multiplier">0 AND "volume_multiplier">0 AND "surcharge_percent">=-100 AND COALESCE("minimum_charge",0)>=0),
  CONSTRAINT "osi_transport_zone_rules_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  CONSTRAINT "osi_transport_zone_rules_approver_pair" CHECK (("approved_by_user_id" IS NULL)=("approved_by_membership_id" IS NULL)),
  CONSTRAINT "osi_transport_zone_rules_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_creator_fkey" FOREIGN KEY ("tenant_id","created_by_membership_id","created_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_approver_fkey" FOREIGN KEY ("tenant_id","approved_by_membership_id","approved_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id","id","user_id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_origin_fkey" FOREIGN KEY ("tenant_id","origin_region_id") REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_destination_fkey" FOREIGN KEY ("tenant_id","destination_region_id") REFERENCES "osi"."osi_geo_regions"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_replaces_fkey" FOREIGN KEY ("tenant_id","replaces_rule_id") REFERENCES "osi"."osi_transport_zone_rules"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "osi_transport_zone_rules_risk_fkey" FOREIGN KEY ("tenant_id","risk_rule_id") REFERENCES "osi"."risk_engine_rules"("tenant_id","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "osi_transport_zone_rules_one_active_series_idx" ON "osi"."osi_transport_zone_rules"("tenant_id","series_id") WHERE "state"='ACTIVE';
CREATE UNIQUE INDEX "osi_transport_zone_rules_one_active_code_idx" ON "osi"."osi_transport_zone_rules"("tenant_id","code") WHERE "state"='ACTIVE';
CREATE INDEX "osi_transport_zone_rules_resolve_idx" ON "osi"."osi_transport_zone_rules"("tenant_id","state","scope","scope_key","priority","valid_from","valid_to");

CREATE OR REPLACE FUNCTION "osi"."db01h_append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='55000'; END; $$;
CREATE TRIGGER "osi_geo_region_aliases_no_update_delete" BEFORE UPDATE OR DELETE ON "osi"."osi_geo_region_aliases"
  FOR EACH ROW EXECUTE FUNCTION "osi"."db01h_append_only_guard"();

CREATE OR REPLACE FUNCTION "osi"."db01h_configuration_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transition_ok boolean;
BEGIN
  IF ROW(OLD."tenant_id",OLD."version",OLD."mode",OLD."source",OLD."source_snapshot_json",OLD."source_hash",OLD."config_hash",OLD."valid_from",OLD."valid_to",OLD."evidence_refs_json",OLD."created_by_user_id",OLD."created_by_membership_id",OLD."request_id",OLD."payload_hash",OLD."created_at")
    IS DISTINCT FROM ROW(NEW."tenant_id",NEW."version",NEW."mode",NEW."source",NEW."source_snapshot_json",NEW."source_hash",NEW."config_hash",NEW."valid_from",NEW."valid_to",NEW."evidence_refs_json",NEW."created_by_user_id",NEW."created_by_membership_id",NEW."request_id",NEW."payload_hash",NEW."created_at")
  THEN RAISE EXCEPTION 'logistics configuration version is immutable' USING ERRCODE='55000'; END IF;
  transition_ok := OLD."state"=NEW."state" OR (OLD."state"='DRAFT' AND NEW."state" IN ('SHADOW','RETIRED')) OR (OLD."state"='SHADOW' AND NEW."state" IN ('ACTIVE','RETIRED')) OR (OLD."state"='ACTIVE' AND NEW."state"='RETIRED');
  IF NOT transition_ok THEN RAISE EXCEPTION 'invalid DB-01H state transition: % -> %',OLD."state",NEW."state" USING ERRCODE='23514'; END IF;
  IF NEW."state" IN ('SHADOW','ACTIVE') AND NEW."approved_at" IS NULL THEN RAISE EXCEPTION 'approved version required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='ACTIVE' AND NEW."activated_at" IS NULL THEN RAISE EXCEPTION 'activation time required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='RETIRED' AND NEW."retired_at" IS NULL THEN RAISE EXCEPTION 'retirement time required' USING ERRCODE='23514'; END IF;
  IF NEW."row_version"<>OLD."row_version"+1 THEN RAISE EXCEPTION 'row_version must increment once' USING ERRCODE='23514'; END IF;
  NEW."updated_at":=CURRENT_TIMESTAMP; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION "osi"."db01h_region_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transition_ok boolean;
BEGIN
  IF ROW(OLD."tenant_id",OLD."series_id",OLD."version",OLD."country_code",OLD."code",OLD."normalized_code",OLD."name",OLD."normalized_name",OLD."administrative_division",OLD."region_type",OLD."zone_type",OLD."latitude",OLD."longitude",OLD."sla_hours",OLD."geography_json",OLD."aliases_snapshot_json",OLD."valid_from",OLD."valid_to",OLD."version_hash",OLD."replaces_region_id",OLD."source",OLD."evidence_refs_json",OLD."created_by_user_id",OLD."created_by_membership_id",OLD."request_id",OLD."payload_hash",OLD."created_at")
    IS DISTINCT FROM ROW(NEW."tenant_id",NEW."series_id",NEW."version",NEW."country_code",NEW."code",NEW."normalized_code",NEW."name",NEW."normalized_name",NEW."administrative_division",NEW."region_type",NEW."zone_type",NEW."latitude",NEW."longitude",NEW."sla_hours",NEW."geography_json",NEW."aliases_snapshot_json",NEW."valid_from",NEW."valid_to",NEW."version_hash",NEW."replaces_region_id",NEW."source",NEW."evidence_refs_json",NEW."created_by_user_id",NEW."created_by_membership_id",NEW."request_id",NEW."payload_hash",NEW."created_at")
  THEN RAISE EXCEPTION 'geo region version is immutable' USING ERRCODE='55000'; END IF;
  IF NEW."state"='ACTIVE' AND EXISTS (
    SELECT 1 FROM "osi"."osi_geo_region_aliases" candidate
    JOIN "osi"."osi_geo_region_aliases" existing ON existing."tenant_id"=candidate."tenant_id" AND existing."country_code"=candidate."country_code" AND existing."normalized_alias"=candidate."normalized_alias" AND existing."region_id"<>candidate."region_id"
    JOIN "osi"."osi_geo_regions" active_region ON active_region."tenant_id"=existing."tenant_id" AND active_region."id"=existing."region_id" AND active_region."state"='ACTIVE'
    WHERE candidate."tenant_id"=NEW."tenant_id" AND candidate."region_id"=NEW."id"
  ) THEN RAISE EXCEPTION 'active geo alias conflicts with another region' USING ERRCODE='23505'; END IF;
  transition_ok := OLD."state"=NEW."state" OR (OLD."state"='DRAFT' AND NEW."state" IN ('SHADOW','RETIRED')) OR (OLD."state"='SHADOW' AND NEW."state" IN ('ACTIVE','RETIRED')) OR (OLD."state"='ACTIVE' AND NEW."state"='RETIRED');
  IF NOT transition_ok THEN RAISE EXCEPTION 'invalid geo region transition' USING ERRCODE='23514'; END IF;
  IF NEW."state" IN ('SHADOW','ACTIVE') AND NEW."approved_at" IS NULL THEN RAISE EXCEPTION 'approved region required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='ACTIVE' AND NEW."activated_at" IS NULL THEN RAISE EXCEPTION 'activation time required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='RETIRED' AND NEW."retired_at" IS NULL THEN RAISE EXCEPTION 'retirement time required' USING ERRCODE='23514'; END IF;
  IF NEW."row_version"<>OLD."row_version"+1 THEN RAISE EXCEPTION 'row_version must increment once' USING ERRCODE='23514'; END IF;
  NEW."updated_at":=CURRENT_TIMESTAMP; RETURN NEW;
END; $$;
CREATE TRIGGER "osi_geo_regions_guard" BEFORE UPDATE ON "osi"."osi_geo_regions" FOR EACH ROW EXECUTE FUNCTION "osi"."db01h_region_guard"();

CREATE OR REPLACE FUNCTION "osi"."db01h_zone_rule_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflict_exists boolean; transition_ok boolean;
BEGIN
  IF ROW(OLD."tenant_id",OLD."series_id",OLD."code",OLD."version",OLD."name",OLD."kind",OLD."priority",OLD."scope_key",OLD."country_code",OLD."zone_type",OLD."region_id",OLD."origin_region_id",OLD."destination_region_id",OLD."distance_min_km",OLD."distance_max_km",OLD."free_km",OLD."km_rate",OLD."surcharge_percent",OLD."sla_hours",OLD."weekend_surcharge_percent",OLD."after_hours_surcharge_percent",OLD."result_hash",OLD."valid_from",OLD."valid_to",OLD."version_hash",OLD."replaces_rule_id",OLD."risk_rule_id",OLD."risk_rule_hash",OLD."source",OLD."evidence_refs_json",OLD."created_by_user_id",OLD."created_by_membership_id",OLD."request_id",OLD."payload_hash",OLD."created_at")
    IS DISTINCT FROM ROW(NEW."tenant_id",NEW."series_id",NEW."code",NEW."version",NEW."name",NEW."kind",NEW."priority",NEW."scope_key",NEW."country_code",NEW."zone_type",NEW."region_id",NEW."origin_region_id",NEW."destination_region_id",NEW."distance_min_km",NEW."distance_max_km",NEW."free_km",NEW."km_rate",NEW."surcharge_percent",NEW."sla_hours",NEW."weekend_surcharge_percent",NEW."after_hours_surcharge_percent",NEW."result_hash",NEW."valid_from",NEW."valid_to",NEW."version_hash",NEW."replaces_rule_id",NEW."risk_rule_id",NEW."risk_rule_hash",NEW."source",NEW."evidence_refs_json",NEW."created_by_user_id",NEW."created_by_membership_id",NEW."request_id",NEW."payload_hash",NEW."created_at")
  THEN RAISE EXCEPTION 'zone rule version is immutable' USING ERRCODE='55000'; END IF;
  IF NEW."state"='ACTIVE' THEN
    SELECT EXISTS(SELECT 1 FROM "osi"."osi_zone_rules" r WHERE r."tenant_id"=NEW."tenant_id" AND r."id"<>NEW."id" AND r."state"='ACTIVE' AND r."kind"=NEW."kind" AND r."scope_key"=NEW."scope_key" AND r."priority"=NEW."priority" AND COALESCE(r."distance_min_km",-1e12)<=COALESCE(NEW."distance_max_km",1e12) AND COALESCE(NEW."distance_min_km",-1e12)<=COALESCE(r."distance_max_km",1e12) AND COALESCE(r."valid_from",'-infinity')<COALESCE(NEW."valid_to",'infinity') AND COALESCE(NEW."valid_from",'-infinity')<COALESCE(r."valid_to",'infinity')) INTO conflict_exists;
    IF conflict_exists THEN RAISE EXCEPTION 'overlapping active logistics rules with equal priority' USING ERRCODE='23505'; END IF;
  END IF;
  transition_ok := OLD."state"=NEW."state" OR (OLD."state"='DRAFT' AND NEW."state" IN ('SHADOW','RETIRED')) OR (OLD."state"='SHADOW' AND NEW."state" IN ('ACTIVE','RETIRED')) OR (OLD."state"='ACTIVE' AND NEW."state"='RETIRED');
  IF NOT transition_ok THEN RAISE EXCEPTION 'invalid zone rule transition' USING ERRCODE='23514'; END IF;
  IF NEW."state" IN ('SHADOW','ACTIVE') AND NEW."approved_at" IS NULL THEN RAISE EXCEPTION 'approved rule required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='ACTIVE' AND NEW."activated_at" IS NULL THEN RAISE EXCEPTION 'activation time required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='RETIRED' AND NEW."retired_at" IS NULL THEN RAISE EXCEPTION 'retirement time required' USING ERRCODE='23514'; END IF;
  IF NEW."row_version"<>OLD."row_version"+1 THEN RAISE EXCEPTION 'row_version must increment once' USING ERRCODE='23514'; END IF;
  NEW."updated_at":=CURRENT_TIMESTAMP; RETURN NEW;
END; $$;
CREATE TRIGGER "osi_zone_rules_guard" BEFORE UPDATE ON "osi"."osi_zone_rules" FOR EACH ROW EXECUTE FUNCTION "osi"."db01h_zone_rule_guard"();

CREATE OR REPLACE FUNCTION "osi"."db01h_transport_rule_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conflict_exists boolean; transition_ok boolean;
BEGIN
  IF ROW(OLD."tenant_id",OLD."series_id",OLD."code",OLD."version",OLD."name",OLD."scope",OLD."priority",OLD."scope_key",OLD."country_code",OLD."service_mode",OLD."zone_type",OLD."origin_region_id",OLD."destination_region_id",OLD."distance_min_km",OLD."distance_max_km",OLD."km_multiplier",OLD."volume_multiplier",OLD."surcharge_percent",OLD."minimum_charge",OLD."result_hash",OLD."valid_from",OLD."valid_to",OLD."version_hash",OLD."replaces_rule_id",OLD."risk_rule_id",OLD."risk_rule_hash",OLD."source",OLD."evidence_refs_json",OLD."created_by_user_id",OLD."created_by_membership_id",OLD."request_id",OLD."payload_hash",OLD."created_at")
    IS DISTINCT FROM ROW(NEW."tenant_id",NEW."series_id",NEW."code",NEW."version",NEW."name",NEW."scope",NEW."priority",NEW."scope_key",NEW."country_code",NEW."service_mode",NEW."zone_type",NEW."origin_region_id",NEW."destination_region_id",NEW."distance_min_km",NEW."distance_max_km",NEW."km_multiplier",NEW."volume_multiplier",NEW."surcharge_percent",NEW."minimum_charge",NEW."result_hash",NEW."valid_from",NEW."valid_to",NEW."version_hash",NEW."replaces_rule_id",NEW."risk_rule_id",NEW."risk_rule_hash",NEW."source",NEW."evidence_refs_json",NEW."created_by_user_id",NEW."created_by_membership_id",NEW."request_id",NEW."payload_hash",NEW."created_at")
  THEN RAISE EXCEPTION 'transport rule version is immutable' USING ERRCODE='55000'; END IF;
  IF NEW."state"='ACTIVE' THEN
    SELECT EXISTS(SELECT 1 FROM "osi"."osi_transport_zone_rules" r WHERE r."tenant_id"=NEW."tenant_id" AND r."id"<>NEW."id" AND r."state"='ACTIVE' AND r."scope"=NEW."scope" AND r."scope_key"=NEW."scope_key" AND r."priority"=NEW."priority" AND COALESCE(r."distance_min_km",-1e12)<=COALESCE(NEW."distance_max_km",1e12) AND COALESCE(NEW."distance_min_km",-1e12)<=COALESCE(r."distance_max_km",1e12) AND COALESCE(r."valid_from",'-infinity')<COALESCE(NEW."valid_to",'infinity') AND COALESCE(NEW."valid_from",'-infinity')<COALESCE(r."valid_to",'infinity')) INTO conflict_exists;
    IF conflict_exists THEN RAISE EXCEPTION 'overlapping active transport rules with equal priority' USING ERRCODE='23505'; END IF;
  END IF;
  transition_ok := OLD."state"=NEW."state" OR (OLD."state"='DRAFT' AND NEW."state" IN ('SHADOW','RETIRED')) OR (OLD."state"='SHADOW' AND NEW."state" IN ('ACTIVE','RETIRED')) OR (OLD."state"='ACTIVE' AND NEW."state"='RETIRED');
  IF NOT transition_ok THEN RAISE EXCEPTION 'invalid transport rule transition' USING ERRCODE='23514'; END IF;
  IF NEW."state" IN ('SHADOW','ACTIVE') AND NEW."approved_at" IS NULL THEN RAISE EXCEPTION 'approved rule required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='ACTIVE' AND NEW."activated_at" IS NULL THEN RAISE EXCEPTION 'activation time required' USING ERRCODE='23514'; END IF;
  IF NEW."state"='RETIRED' AND NEW."retired_at" IS NULL THEN RAISE EXCEPTION 'retirement time required' USING ERRCODE='23514'; END IF;
  IF NEW."row_version"<>OLD."row_version"+1 THEN RAISE EXCEPTION 'row_version must increment once' USING ERRCODE='23514'; END IF;
  NEW."updated_at":=CURRENT_TIMESTAMP; RETURN NEW;
END; $$;
CREATE TRIGGER "osi_transport_zone_rules_guard" BEFORE UPDATE ON "osi"."osi_transport_zone_rules" FOR EACH ROW EXECUTE FUNCTION "osi"."db01h_transport_rule_guard"();
CREATE TRIGGER "logistics_configuration_versions_guard" BEFORE UPDATE ON "osi"."logistics_configuration_versions" FOR EACH ROW EXECUTE FUNCTION "osi"."db01h_configuration_guard"();
