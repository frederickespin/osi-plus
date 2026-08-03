-- DB-01G: QuoteChangeOrder multiempresa y adendas contractuales.
-- Cadena experimental local: baseline -> MT-01A -> DB-01D -> DB-01E -> DB-01F -> DB-01G.
-- No activa endpoints ni migra datos heredados.

CREATE TYPE "osi"."QuoteChangeOrderStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PENDING_CUSTOMER',
  'ACCEPTED',
  'EXECUTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'SUPERSEDED'
);

CREATE TYPE "osi"."QuoteChangeOrderItemChange" AS ENUM (
  'ADDED',
  'MODIFIED',
  'REMOVED'
);

CREATE TYPE "osi"."QuoteChangeOrderPolicyStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'RETIRED'
);

-- Permite comprobar en una sola FK que la cotización pertenece al caso indicado.
ALTER TABLE "osi"."osi_pipeline_case_quotes"
  ADD CONSTRAINT "osi_pipeline_case_quotes_case_id_id_key" UNIQUE ("caseId", "id");

-- Puente temporal hasta MT-01B. La vinculación se crea sólo por un adaptador
-- interno autorizado; una cotización sólo puede quedar ligada a un tenant.
CREATE TABLE "osi"."quote_change_order_subjects" (
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "base_quote_id" TEXT NOT NULL,
  "bound_by_user_id" TEXT NOT NULL,
  "bound_by_membership_id" TEXT NOT NULL,
  "binding_request_id" VARCHAR(191) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_order_subjects_pkey"
    PRIMARY KEY ("tenant_id", "pipeline_case_id", "base_quote_id"),
  CONSTRAINT "quote_change_order_subjects_quote_key" UNIQUE ("base_quote_id"),
  CONSTRAINT "quote_change_order_subjects_case_quote_key"
    UNIQUE ("pipeline_case_id", "base_quote_id"),
  CONSTRAINT "quote_change_order_subjects_tenant_request_key"
    UNIQUE ("tenant_id", "binding_request_id"),
  CONSTRAINT "quote_change_order_subjects_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_subjects_case_fkey"
    FOREIGN KEY ("pipeline_case_id") REFERENCES "osi"."osi_pipeline_cases"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_subjects_quote_case_fkey"
    FOREIGN KEY ("pipeline_case_id", "base_quote_id")
      REFERENCES "osi"."osi_pipeline_case_quotes"("caseId", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_subjects_actor_fkey"
    FOREIGN KEY ("tenant_id", "bound_by_membership_id", "bound_by_user_id")
      REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "quote_change_order_subjects_tenant_case_idx"
  ON "osi"."quote_change_order_subjects" ("tenant_id", "pipeline_case_id");

CREATE TABLE "osi"."quote_change_order_sequences" (
  "tenant_id" TEXT PRIMARY KEY,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_order_sequences_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_sequences_positive"
    CHECK ("next_value" > 0)
);

CREATE TABLE "osi"."quote_change_order_policies" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "status" "osi"."QuoteChangeOrderPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "cap_percent" DECIMAL(7,4) NOT NULL,
  "approval_rules_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "policy_hash" CHAR(64) NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_order_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_change_order_policies_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "quote_change_order_policies_tenant_code_version_key"
    UNIQUE ("tenant_id", "code", "version"),
  CONSTRAINT "quote_change_order_policies_tenant_request_key"
    UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "quote_change_order_policies_tenant_hash_key"
    UNIQUE ("tenant_id", "policy_hash"),
  CONSTRAINT "quote_change_order_policies_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_policies_actor_fkey"
    FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id")
      REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_policies_cap_range"
    CHECK ("cap_percent" >= 0 AND "cap_percent" <= 100),
  CONSTRAINT "quote_change_order_policies_version_positive" CHECK ("version" > 0),
  CONSTRAINT "quote_change_order_policies_validity"
    CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "quote_change_order_policies_rules_object"
    CHECK (jsonb_typeof("approval_rules_json") = 'object')
);

CREATE UNIQUE INDEX "quote_change_order_policies_one_active_idx"
  ON "osi"."quote_change_order_policies" ("tenant_id", "code")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "quote_change_order_policies_tenant_status_idx"
  ON "osi"."quote_change_order_policies" ("tenant_id", "status", "valid_from", "valid_to");

CREATE TABLE "osi"."quote_change_orders" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "base_quote_id" TEXT NOT NULL,
  "base_quote_version" INTEGER NOT NULL,
  "base_quote_hash" CHAR(64) NOT NULL,
  "base_quote_snapshot_json" JSONB NOT NULL,
  "series_id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "sequence_number" BIGINT NOT NULL,
  "version" INTEGER NOT NULL,
  "previous_version_id" TEXT,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "change_type" VARCHAR(80) NOT NULL,
  "classification" VARCHAR(120) NOT NULL,
  "contract_stage" VARCHAR(80) NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "previous_subtotal" DECIMAL(18,2) NOT NULL,
  "increment_amount" DECIMAL(18,2) NOT NULL,
  "reduction_amount" DECIMAL(18,2) NOT NULL,
  "tax_amount" DECIMAL(18,2) NOT NULL,
  "previous_total" DECIMAL(18,2) NOT NULL,
  "new_total" DECIMAL(18,2) NOT NULL,
  "variation_amount" DECIMAL(18,2) NOT NULL,
  "variation_percent" DECIMAL(9,4) NOT NULL,
  "policy_id" TEXT NOT NULL,
  "policy_snapshot_json" JSONB NOT NULL,
  "cap_amount" DECIMAL(18,2) NOT NULL,
  "cumulative_increase" DECIMAL(18,2) NOT NULL,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "approval_reasons_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "approval_request_id" TEXT,
  "risk_recheck_required" BOOLEAN NOT NULL DEFAULT false,
  "risk_factor_changes_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risk_evaluation_id" TEXT,
  "risk_material_hash" CHAR(64),
  "risk_snapshot_json" JSONB,
  "logistic_override_id" TEXT,
  "customer_acceptance_required" BOOLEAN NOT NULL DEFAULT true,
  "customer_decision" VARCHAR(20),
  "customer_decided_at" TIMESTAMP(3),
  "customer_actor_snapshot" VARCHAR(240),
  "customer_acceptance_method" VARCHAR(80),
  "customer_acceptance_hash" CHAR(64),
  "evidence_refs_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" "osi"."QuoteChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "requested_by_user_id" TEXT NOT NULL,
  "requested_by_membership_id" TEXT NOT NULL,
  "executed_by_user_id" TEXT,
  "executed_by_membership_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "sent_to_customer_at" TIMESTAMP(3),
  "executed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_change_orders_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "quote_change_orders_tenant_request_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "quote_change_orders_tenant_code_version_key" UNIQUE ("tenant_id", "code", "version"),
  CONSTRAINT "quote_change_orders_tenant_sequence_version_key"
    UNIQUE ("tenant_id", "sequence_number", "version"),
  CONSTRAINT "quote_change_orders_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_subject_fkey"
    FOREIGN KEY ("tenant_id", "pipeline_case_id", "base_quote_id")
      REFERENCES "osi"."quote_change_order_subjects"("tenant_id", "pipeline_case_id", "base_quote_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_requester_fkey"
    FOREIGN KEY ("tenant_id", "requested_by_membership_id", "requested_by_user_id")
      REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_executor_fkey"
    FOREIGN KEY ("tenant_id", "executed_by_membership_id", "executed_by_user_id")
      REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_previous_version_fkey"
    FOREIGN KEY ("tenant_id", "previous_version_id")
      REFERENCES "osi"."quote_change_orders"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_policy_fkey"
    FOREIGN KEY ("tenant_id", "policy_id")
      REFERENCES "osi"."quote_change_order_policies"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_approval_fkey"
    FOREIGN KEY ("tenant_id", "approval_request_id")
      REFERENCES "osi"."approval_requests"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_risk_evaluation_fkey"
    FOREIGN KEY ("tenant_id", "risk_evaluation_id")
      REFERENCES "osi"."risk_evaluations"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_logistic_override_fkey"
    FOREIGN KEY ("tenant_id", "logistic_override_id")
      REFERENCES "osi"."logistic_override_approvals"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_orders_versions_positive"
    CHECK ("version" > 0 AND "base_quote_version" > 0 AND "row_version" > 0),
  CONSTRAINT "quote_change_orders_sequence_positive" CHECK ("sequence_number" > 0),
  CONSTRAINT "quote_change_orders_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "quote_change_orders_amounts_nonnegative"
    CHECK (
      "previous_subtotal" >= 0 AND "increment_amount" >= 0 AND
      "reduction_amount" >= 0 AND "tax_amount" >= 0 AND
      "previous_total" >= 0 AND "new_total" >= 0 AND
      "cap_amount" >= 0 AND "cumulative_increase" >= 0
    ),
  CONSTRAINT "quote_change_orders_total_reconciles"
    CHECK ("new_total" = "previous_total" + "increment_amount" - "reduction_amount" + "tax_amount"),
  CONSTRAINT "quote_change_orders_variation_reconciles"
    CHECK ("variation_amount" = "new_total" - "previous_total"),
  CONSTRAINT "quote_change_orders_json_shapes"
    CHECK (
      jsonb_typeof("base_quote_snapshot_json") = 'object' AND
      jsonb_typeof("policy_snapshot_json") = 'object' AND
      jsonb_typeof("approval_reasons_json") = 'array' AND
      jsonb_typeof("risk_factor_changes_json") = 'array' AND
      jsonb_typeof("evidence_refs_json") = 'array'
    ),
  CONSTRAINT "quote_change_orders_actor_pair"
    CHECK (("executed_by_user_id" IS NULL) = ("executed_by_membership_id" IS NULL)),
  CONSTRAINT "quote_change_orders_customer_decision"
    CHECK ("customer_decision" IS NULL OR "customer_decision" IN ('ACCEPTED', 'REJECTED'))
);

CREATE UNIQUE INDEX "quote_change_orders_one_current_version_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "series_id")
  WHERE "is_current";
CREATE UNIQUE INDEX "quote_change_orders_approval_request_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "approval_request_id")
  WHERE "approval_request_id" IS NOT NULL;
CREATE INDEX "quote_change_orders_tenant_quote_status_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "base_quote_id", "status", "created_at" DESC);
CREATE INDEX "quote_change_orders_tenant_case_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "pipeline_case_id", "created_at" DESC);
CREATE INDEX "quote_change_orders_tenant_status_expiry_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "status", "expires_at");
CREATE INDEX "quote_change_orders_tenant_requester_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "requested_by_membership_id", "created_at" DESC);
CREATE INDEX "quote_change_orders_previous_version_idx"
  ON "osi"."quote_change_orders" ("tenant_id", "previous_version_id");

CREATE TABLE "osi"."quote_change_order_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "change_order_id" TEXT NOT NULL,
  "line_key" VARCHAR(191) NOT NULL,
  "change_kind" "osi"."QuoteChangeOrderItemChange" NOT NULL,
  "classification" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "unit" VARCHAR(40),
  "source_line_id" TEXT,
  "previous_quantity" DECIMAL(18,4),
  "new_quantity" DECIMAL(18,4),
  "previous_unit_price" DECIMAL(18,4),
  "new_unit_price" DECIMAL(18,4),
  "previous_line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "new_line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_change_order_items_tenant_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "quote_change_order_items_line_key" UNIQUE ("tenant_id", "change_order_id", "line_key"),
  CONSTRAINT "quote_change_order_items_order_fkey"
    FOREIGN KEY ("tenant_id", "change_order_id")
      REFERENCES "osi"."quote_change_orders"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_items_amounts_nonnegative"
    CHECK ("previous_line_total" >= 0 AND "new_line_total" >= 0),
  CONSTRAINT "quote_change_order_items_added_shape"
    CHECK ("change_kind" <> 'ADDED' OR "previous_line_total" = 0),
  CONSTRAINT "quote_change_order_items_removed_shape"
    CHECK ("change_kind" <> 'REMOVED' OR "new_line_total" = 0)
);

CREATE INDEX "quote_change_order_items_order_idx"
  ON "osi"."quote_change_order_items" ("tenant_id", "change_order_id", "created_at");
CREATE INDEX "quote_change_order_items_classification_idx"
  ON "osi"."quote_change_order_items" ("tenant_id", "classification");

CREATE TABLE "osi"."quote_change_order_commands" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "change_order_id" TEXT NOT NULL,
  "change_order_version" INTEGER NOT NULL,
  "command" VARCHAR(80) NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "result_json" JSONB NOT NULL,
  "actor_user_id" TEXT,
  "actor_membership_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_change_order_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_change_order_commands_tenant_request_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "quote_change_order_commands_order_fkey"
    FOREIGN KEY ("tenant_id", "change_order_id")
      REFERENCES "osi"."quote_change_orders"("tenant_id", "id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_commands_actor_fkey"
    FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id")
      REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
      ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "quote_change_order_commands_actor_pair"
    CHECK (("actor_user_id" IS NULL) = ("actor_membership_id" IS NULL)),
  CONSTRAINT "quote_change_order_commands_result_object"
    CHECK (jsonb_typeof("result_json") = 'object')
);

CREATE INDEX "quote_change_order_commands_order_idx"
  ON "osi"."quote_change_order_commands" ("tenant_id", "change_order_id", "created_at" DESC);

CREATE FUNCTION "osi"."quote_change_order_append_only_guard"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "quote_change_order_items_append_only"
  BEFORE UPDATE OR DELETE ON "osi"."quote_change_order_items"
  FOR EACH ROW EXECUTE FUNCTION "osi"."quote_change_order_append_only_guard"();

CREATE TRIGGER "quote_change_order_commands_append_only"
  BEFORE UPDATE OR DELETE ON "osi"."quote_change_order_commands"
  FOR EACH ROW EXECUTE FUNCTION "osi"."quote_change_order_append_only_guard"();

CREATE FUNCTION "osi"."quote_change_order_guard"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_terminal boolean := OLD."status" IN ('EXECUTED','REJECTED','CANCELLED','EXPIRED','SUPERSEDED');
  transition_ok boolean := false;
BEGIN
  IF old_terminal THEN
    RAISE EXCEPTION 'terminal quote change order is immutable' USING ERRCODE = '55000';
  END IF;

  transition_ok :=
    (OLD."status" = NEW."status") OR
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('PENDING_APPROVAL','APPROVED','CANCELLED','EXPIRED','SUPERSEDED')) OR
    (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('APPROVED','REJECTED','CANCELLED','EXPIRED','SUPERSEDED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('PENDING_CUSTOMER','EXECUTED','CANCELLED','EXPIRED','SUPERSEDED')) OR
    (OLD."status" = 'PENDING_CUSTOMER' AND NEW."status" IN ('ACCEPTED','REJECTED','CANCELLED','EXPIRED','SUPERSEDED')) OR
    (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('EXECUTED','CANCELLED','EXPIRED'));
  IF NOT transition_ok THEN
    RAISE EXCEPTION 'invalid quote change order transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = '23514';
  END IF;

  IF ROW(
    OLD."tenant_id", OLD."pipeline_case_id", OLD."base_quote_id", OLD."base_quote_version",
    OLD."base_quote_hash", OLD."base_quote_snapshot_json", OLD."series_id", OLD."code",
    OLD."sequence_number", OLD."version", OLD."previous_version_id", OLD."change_type",
    OLD."classification", OLD."contract_stage", OLD."reason", OLD."description", OLD."currency",
    OLD."previous_subtotal", OLD."increment_amount", OLD."reduction_amount", OLD."tax_amount",
    OLD."previous_total", OLD."new_total", OLD."variation_amount", OLD."variation_percent",
    OLD."policy_id", OLD."policy_snapshot_json", OLD."cap_amount", OLD."cumulative_increase",
    OLD."requires_approval", OLD."approval_reasons_json", OLD."risk_recheck_required",
    OLD."risk_factor_changes_json", OLD."requested_by_user_id", OLD."requested_by_membership_id",
    OLD."request_id", OLD."payload_hash", OLD."created_at"
  ) IS DISTINCT FROM ROW(
    NEW."tenant_id", NEW."pipeline_case_id", NEW."base_quote_id", NEW."base_quote_version",
    NEW."base_quote_hash", NEW."base_quote_snapshot_json", NEW."series_id", NEW."code",
    NEW."sequence_number", NEW."version", NEW."previous_version_id", NEW."change_type",
    NEW."classification", NEW."contract_stage", NEW."reason", NEW."description", NEW."currency",
    NEW."previous_subtotal", NEW."increment_amount", NEW."reduction_amount", NEW."tax_amount",
    NEW."previous_total", NEW."new_total", NEW."variation_amount", NEW."variation_percent",
    NEW."policy_id", NEW."policy_snapshot_json", NEW."cap_amount", NEW."cumulative_increase",
    NEW."requires_approval", NEW."approval_reasons_json", NEW."risk_recheck_required",
    NEW."risk_factor_changes_json", NEW."requested_by_user_id", NEW."requested_by_membership_id",
    NEW."request_id", NEW."payload_hash", NEW."created_at"
  ) THEN
    RAISE EXCEPTION 'material quote change order fields are immutable; create a new version'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."row_version" <> OLD."row_version" + 1 THEN
    RAISE EXCEPTION 'row_version must increase exactly by one' USING ERRCODE = '23514';
  END IF;
  NEW."updated_at" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "quote_change_orders_guard"
  BEFORE UPDATE ON "osi"."quote_change_orders"
  FOR EACH ROW EXECUTE FUNCTION "osi"."quote_change_order_guard"();
