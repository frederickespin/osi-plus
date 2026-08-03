-- DB-01F. Motor de riesgo multiempresa experimental.
-- Cadena: baseline -> MT-01A -> DB-01D -> DB-01E -> DB-01F.

CREATE TYPE "osi"."RiskRuleConditionType" AS ENUM (
  'DISTANCE_OVER_KM',
  'REGION_IN_SET',
  'LOGISTIC_FLAG_PRESENT',
  'MARGIN_BELOW_PERCENT'
);

CREATE TYPE "osi"."RiskDecisionResult" AS ENUM ('PASS', 'REVIEW_REQUIRED', 'BLOCKED');
CREATE TYPE "osi"."RiskRuleState" AS ENUM ('DRAFT', 'SHADOW', 'ACTIVE', 'RETIRED');
CREATE TYPE "osi"."RiskEvaluationMode" AS ENUM ('SHADOW', 'ENFORCED');
CREATE TYPE "osi"."RiskEngineOperationMode" AS ENUM ('LEGACY_ONLY', 'SHADOW', 'ENFORCED');

CREATE TABLE "osi"."risk_engine_settings" (
  "tenant_id" TEXT NOT NULL,
  "mode" "osi"."RiskEngineOperationMode" NOT NULL DEFAULT 'LEGACY_ONLY',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_user_id" TEXT,
  "updated_by_membership_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_engine_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "risk_engine_settings_version_check" CHECK ("version" >= 1),
  CONSTRAINT "risk_engine_settings_actor_pair_check" CHECK (
    ("updated_by_user_id" IS NULL) = ("updated_by_membership_id" IS NULL)
  ),
  CONSTRAINT "risk_engine_settings_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "risk_engine_settings_actor_membership_fkey" FOREIGN KEY
    ("tenant_id", "updated_by_membership_id", "updated_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT
);

CREATE TABLE "osi"."risk_engine_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "condition_type" "osi"."RiskRuleConditionType" NOT NULL,
  "condition_config_json" JSONB NOT NULL,
  "condition_scope_hash" CHAR(64) NOT NULL,
  "result" "osi"."RiskDecisionResult" NOT NULL,
  "state" "osi"."RiskRuleState" NOT NULL DEFAULT 'DRAFT',
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "version_hash" CHAR(64) NOT NULL,
  "replaces_rule_id" TEXT,
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
  CONSTRAINT "risk_engine_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_engine_rules_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "risk_engine_rules_tenant_code_version_key" UNIQUE ("tenant_id", "code", "version"),
  CONSTRAINT "risk_engine_rules_tenant_request_id_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "risk_engine_rules_tenant_version_hash_key" UNIQUE ("tenant_id", "version_hash"),
  CONSTRAINT "risk_engine_rules_version_check" CHECK ("version" >= 1),
  CONSTRAINT "risk_engine_rules_priority_check" CHECK ("priority" BETWEEN 0 AND 100000),
  CONSTRAINT "risk_engine_rules_validity_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "risk_engine_rules_approval_pair_check" CHECK (
    ("approved_by_user_id" IS NULL) = ("approved_by_membership_id" IS NULL)
  ),
  CONSTRAINT "risk_engine_rules_approval_time_check" CHECK (
    ("approved_at" IS NULL) = ("approved_by_membership_id" IS NULL)
  ),
  CONSTRAINT "risk_engine_rules_active_check" CHECK (
    "state" <> 'ACTIVE' OR ("approved_at" IS NOT NULL AND "activated_at" IS NOT NULL)
  ),
  CONSTRAINT "risk_engine_rules_retired_check" CHECK (
    "state" <> 'RETIRED' OR "retired_at" IS NOT NULL
  ),
  CONSTRAINT "risk_engine_rules_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "risk_engine_rules_creator_membership_fkey" FOREIGN KEY
    ("tenant_id", "created_by_membership_id", "created_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  CONSTRAINT "risk_engine_rules_approver_membership_fkey" FOREIGN KEY
    ("tenant_id", "approved_by_membership_id", "approved_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  CONSTRAINT "risk_engine_rules_replaces_fkey" FOREIGN KEY ("tenant_id", "replaces_rule_id")
    REFERENCES "osi"."risk_engine_rules"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "risk_engine_rules_one_active_code_idx"
  ON "osi"."risk_engine_rules"("tenant_id", "code") WHERE "state" = 'ACTIVE';
CREATE UNIQUE INDEX "risk_engine_rules_one_active_scope_idx"
  ON "osi"."risk_engine_rules"("tenant_id", "condition_scope_hash") WHERE "state" = 'ACTIVE';
CREATE INDEX "risk_engine_rules_tenant_state_validity_idx"
  ON "osi"."risk_engine_rules"("tenant_id", "state", "valid_from", "valid_to", "priority");
CREATE INDEX "risk_engine_rules_tenant_condition_idx"
  ON "osi"."risk_engine_rules"("tenant_id", "condition_type", "state");
CREATE INDEX "risk_engine_rules_replaces_idx"
  ON "osi"."risk_engine_rules"("tenant_id", "replaces_rule_id");

CREATE TABLE "osi"."risk_evaluations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "entity" VARCHAR(120) NOT NULL,
  "entity_id" VARCHAR(191) NOT NULL,
  "case_id" TEXT,
  "quote_id" TEXT,
  "quote_version" INTEGER,
  "material_hash" CHAR(64) NOT NULL,
  "input_snapshot_json" JSONB NOT NULL,
  "rules_snapshot_json" JSONB NOT NULL,
  "ruleset_hash" CHAR(64) NOT NULL,
  "matched_rules_json" JSONB NOT NULL,
  "factors_json" JSONB NOT NULL,
  "reasons_json" JSONB NOT NULL,
  "result" "osi"."RiskDecisionResult" NOT NULL,
  "mode" "osi"."RiskEvaluationMode" NOT NULL,
  "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "actor_user_id" TEXT,
  "actor_membership_id" TEXT,
  "approval_request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_evaluations_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "risk_evaluations_tenant_request_id_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "risk_evaluations_actor_pair_check" CHECK (
    ("actor_user_id" IS NULL) = ("actor_membership_id" IS NULL)
  ),
  CONSTRAINT "risk_evaluations_quote_version_check" CHECK ("quote_version" IS NULL OR "quote_version" >= 1),
  CONSTRAINT "risk_evaluations_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "risk_evaluations_actor_membership_fkey" FOREIGN KEY
    ("tenant_id", "actor_membership_id", "actor_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT,
  CONSTRAINT "risk_evaluations_approval_request_fkey" FOREIGN KEY
    ("tenant_id", "approval_request_id") REFERENCES "osi"."approval_requests"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE INDEX "risk_evaluations_tenant_entity_idx"
  ON "osi"."risk_evaluations"("tenant_id", "entity", "entity_id", "evaluated_at" DESC);
CREATE INDEX "risk_evaluations_tenant_result_idx"
  ON "osi"."risk_evaluations"("tenant_id", "result", "mode", "evaluated_at" DESC);
CREATE INDEX "risk_evaluations_tenant_actor_idx"
  ON "osi"."risk_evaluations"("tenant_id", "actor_membership_id", "evaluated_at" DESC);
CREATE INDEX "risk_evaluations_tenant_case_quote_idx"
  ON "osi"."risk_evaluations"("tenant_id", "case_id", "quote_id", "quote_version");

CREATE TABLE "osi"."risk_evaluation_rules" (
  "tenant_id" TEXT NOT NULL,
  "evaluation_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "rule_code" VARCHAR(100) NOT NULL,
  "rule_version" INTEGER NOT NULL,
  "rule_hash" CHAR(64) NOT NULL,
  "matched" BOOLEAN NOT NULL,
  "result" "osi"."RiskDecisionResult" NOT NULL,
  "reasons_json" JSONB NOT NULL,
  CONSTRAINT "risk_evaluation_rules_pkey" PRIMARY KEY ("tenant_id", "evaluation_id", "rule_id"),
  CONSTRAINT "risk_evaluation_rules_evaluation_fkey" FOREIGN KEY ("tenant_id", "evaluation_id")
    REFERENCES "osi"."risk_evaluations"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "risk_evaluation_rules_rule_fkey" FOREIGN KEY ("tenant_id", "rule_id")
    REFERENCES "osi"."risk_engine_rules"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE INDEX "risk_evaluation_rules_rule_idx"
  ON "osi"."risk_evaluation_rules"("tenant_id", "rule_id", "matched");

CREATE OR REPLACE FUNCTION "osi"."reject_risk_evaluation_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'risk evaluations are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "risk_evaluations_no_update"
BEFORE UPDATE ON "osi"."risk_evaluations"
FOR EACH ROW EXECUTE FUNCTION "osi"."reject_risk_evaluation_mutation"();
CREATE TRIGGER "risk_evaluations_no_delete"
BEFORE DELETE ON "osi"."risk_evaluations"
FOR EACH ROW EXECUTE FUNCTION "osi"."reject_risk_evaluation_mutation"();
CREATE TRIGGER "risk_evaluation_rules_no_update"
BEFORE UPDATE ON "osi"."risk_evaluation_rules"
FOR EACH ROW EXECUTE FUNCTION "osi"."reject_risk_evaluation_mutation"();
CREATE TRIGGER "risk_evaluation_rules_no_delete"
BEFORE DELETE ON "osi"."risk_evaluation_rules"
FOR EACH ROW EXECUTE FUNCTION "osi"."reject_risk_evaluation_mutation"();

CREATE OR REPLACE FUNCTION "osi"."protect_risk_rule_version"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
     OR OLD."code" IS DISTINCT FROM NEW."code"
     OR OLD."version" IS DISTINCT FROM NEW."version"
     OR OLD."name" IS DISTINCT FROM NEW."name"
     OR OLD."description" IS DISTINCT FROM NEW."description"
     OR OLD."priority" IS DISTINCT FROM NEW."priority"
     OR OLD."condition_type" IS DISTINCT FROM NEW."condition_type"
     OR OLD."condition_config_json" IS DISTINCT FROM NEW."condition_config_json"
     OR OLD."condition_scope_hash" IS DISTINCT FROM NEW."condition_scope_hash"
     OR OLD."result" IS DISTINCT FROM NEW."result"
     OR OLD."valid_from" IS DISTINCT FROM NEW."valid_from"
     OR OLD."valid_to" IS DISTINCT FROM NEW."valid_to"
     OR OLD."version_hash" IS DISTINCT FROM NEW."version_hash"
     OR OLD."replaces_rule_id" IS DISTINCT FROM NEW."replaces_rule_id"
     OR OLD."created_by_user_id" IS DISTINCT FROM NEW."created_by_user_id"
     OR OLD."created_by_membership_id" IS DISTINCT FROM NEW."created_by_membership_id"
     OR OLD."request_id" IS DISTINCT FROM NEW."request_id"
     OR OLD."payload_hash" IS DISTINCT FROM NEW."payload_hash"
     OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'risk rule version content is immutable' USING ERRCODE = '55000';
  END IF;

  IF NOT (
    OLD."state" = NEW."state"
    OR (OLD."state" = 'DRAFT' AND NEW."state" IN ('SHADOW', 'RETIRED'))
    OR (OLD."state" = 'SHADOW' AND NEW."state" IN ('ACTIVE', 'RETIRED'))
    OR (OLD."state" = 'ACTIVE' AND NEW."state" = 'RETIRED')
  ) THEN
    RAISE EXCEPTION 'invalid risk rule state transition % -> %', OLD."state", NEW."state" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "risk_engine_rules_protect_version"
BEFORE UPDATE ON "osi"."risk_engine_rules"
FOR EACH ROW EXECUTE FUNCTION "osi"."protect_risk_rule_version"();
