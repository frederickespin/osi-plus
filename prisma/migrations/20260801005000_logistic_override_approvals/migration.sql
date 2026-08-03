-- DB-01F. Especialización logística de ApprovalRequest; no duplica su estado.

CREATE TABLE "osi"."logistic_override_approvals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "approval_request_id" TEXT NOT NULL,
  "risk_evaluation_id" TEXT NOT NULL,
  "blocking_rule_id" TEXT NOT NULL,
  "entity" VARCHAR(120) NOT NULL,
  "entity_id" VARCHAR(191) NOT NULL,
  "case_id" TEXT,
  "quote_id" TEXT,
  "quote_version" INTEGER,
  "material_hash" CHAR(64) NOT NULL,
  "business_reason" TEXT NOT NULL,
  "scope_json" JSONB NOT NULL,
  "scope_hash" CHAR(64) NOT NULL,
  "original_value_json" JSONB NOT NULL,
  "authorized_value_json" JSONB NOT NULL,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_to" TIMESTAMP(3) NOT NULL,
  "conditions_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "evidence_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "references_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "decision_hash" CHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistic_override_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "logistic_override_approvals_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "logistic_override_approvals_approval_key" UNIQUE ("tenant_id", "approval_request_id"),
  CONSTRAINT "logistic_override_validity_check" CHECK ("valid_to" > "valid_from"),
  CONSTRAINT "logistic_override_quote_version_check" CHECK ("quote_version" IS NULL OR "quote_version" >= 1),
  CONSTRAINT "logistic_override_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "logistic_override_approval_request_fkey" FOREIGN KEY ("tenant_id", "approval_request_id")
    REFERENCES "osi"."approval_requests"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "logistic_override_risk_evaluation_fkey" FOREIGN KEY ("tenant_id", "risk_evaluation_id")
    REFERENCES "osi"."risk_evaluations"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "logistic_override_blocking_rule_fkey" FOREIGN KEY ("tenant_id", "blocking_rule_id")
    REFERENCES "osi"."risk_engine_rules"("tenant_id", "id") ON DELETE RESTRICT
);

CREATE INDEX "logistic_override_tenant_entity_idx"
  ON "osi"."logistic_override_approvals"("tenant_id", "entity", "entity_id", "created_at" DESC);
CREATE INDEX "logistic_override_tenant_quote_idx"
  ON "osi"."logistic_override_approvals"("tenant_id", "quote_id", "quote_version", "material_hash");
CREATE INDEX "logistic_override_evaluation_idx"
  ON "osi"."logistic_override_approvals"("tenant_id", "risk_evaluation_id");
CREATE INDEX "logistic_override_validity_idx"
  ON "osi"."logistic_override_approvals"("tenant_id", "valid_from", "valid_to");

CREATE OR REPLACE FUNCTION "osi"."protect_logistic_override"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."tenant_id" IS DISTINCT FROM NEW."tenant_id"
     OR OLD."approval_request_id" IS DISTINCT FROM NEW."approval_request_id"
     OR OLD."risk_evaluation_id" IS DISTINCT FROM NEW."risk_evaluation_id"
     OR OLD."blocking_rule_id" IS DISTINCT FROM NEW."blocking_rule_id"
     OR OLD."entity" IS DISTINCT FROM NEW."entity"
     OR OLD."entity_id" IS DISTINCT FROM NEW."entity_id"
     OR OLD."case_id" IS DISTINCT FROM NEW."case_id"
     OR OLD."quote_id" IS DISTINCT FROM NEW."quote_id"
     OR OLD."quote_version" IS DISTINCT FROM NEW."quote_version"
     OR OLD."material_hash" IS DISTINCT FROM NEW."material_hash"
     OR OLD."business_reason" IS DISTINCT FROM NEW."business_reason"
     OR OLD."scope_json" IS DISTINCT FROM NEW."scope_json"
     OR OLD."scope_hash" IS DISTINCT FROM NEW."scope_hash"
     OR OLD."original_value_json" IS DISTINCT FROM NEW."original_value_json"
     OR OLD."authorized_value_json" IS DISTINCT FROM NEW."authorized_value_json"
     OR OLD."valid_from" IS DISTINCT FROM NEW."valid_from"
     OR OLD."valid_to" IS DISTINCT FROM NEW."valid_to"
     OR OLD."conditions_json" IS DISTINCT FROM NEW."conditions_json"
     OR OLD."evidence_json" IS DISTINCT FROM NEW."evidence_json"
     OR OLD."references_json" IS DISTINCT FROM NEW."references_json"
     OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'logistic override scope is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD."decision_hash" IS NOT NULL AND OLD."decision_hash" IS DISTINCT FROM NEW."decision_hash" THEN
    RAISE EXCEPTION 'logistic override decision is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "logistic_override_protect_scope"
BEFORE UPDATE ON "osi"."logistic_override_approvals"
FOR EACH ROW EXECUTE FUNCTION "osi"."protect_logistic_override"();
