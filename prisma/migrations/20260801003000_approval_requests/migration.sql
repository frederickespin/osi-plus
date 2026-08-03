-- DB-01E — ApprovalRequest multiempresa.
-- Cadena experimental y local: baseline -> MT-01A -> DB-01D -> DB-01E.
-- Cambio aditivo. No importa ni convierte milestonesJson.

CREATE TYPE "osi"."ApprovalRequestStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'
);

CREATE TABLE "osi"."approval_requests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "approval_type" VARCHAR(120) NOT NULL,
  "entity" VARCHAR(120) NOT NULL,
  "entity_id" VARCHAR(191) NOT NULL,
  "requester_user_id" TEXT NOT NULL,
  "requester_membership_id" TEXT NOT NULL,
  "assigned_approver_user_id" TEXT,
  "assigned_approver_membership_id" TEXT,
  "status" "osi"."ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "request_reason" TEXT NOT NULL,
  "evaluation_snapshot_json" JSONB NOT NULL,
  "risk_level" VARCHAR(40),
  "risk_evaluation_ref" VARCHAR(191),
  "risk_result" VARCHAR(40),
  "risk_rules_version" VARCHAR(120),
  "risk_rules_hash" CHAR(64),
  "risk_factors_json" JSONB,
  "risk_reasons_json" JSONB,
  "requires_logistic_override" BOOLEAN NOT NULL DEFAULT false,
  "separation_of_duties_required" BOOLEAN NOT NULL DEFAULT true,
  "policy_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMP(3),
  "decider_user_id" TEXT,
  "decider_membership_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "decision_reason" TEXT,
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "decision_request_id" VARCHAR(191),
  "decision_payload_hash" CHAR(64),
  "previous_request_id" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_requests_version_check" CHECK ("version" >= 1),
  CONSTRAINT "approval_requests_text_not_blank_check" CHECK (
    BTRIM("approval_type") <> '' AND BTRIM("entity") <> '' AND
    BTRIM("entity_id") <> '' AND BTRIM("request_reason") <> '' AND
    BTRIM("request_id") <> ''
  ),
  CONSTRAINT "approval_requests_assignee_pair_check" CHECK (
    ("assigned_approver_user_id" IS NULL) = ("assigned_approver_membership_id" IS NULL)
  ),
  CONSTRAINT "approval_requests_decider_pair_check" CHECK (
    ("decider_user_id" IS NULL) = ("decider_membership_id" IS NULL)
  ),
  CONSTRAINT "approval_requests_decision_request_pair_check" CHECK (
    ("decision_request_id" IS NULL) = ("decision_payload_hash" IS NULL)
  ),
  CONSTRAINT "approval_requests_risk_result_check" CHECK (
    "risk_result" IS NULL OR "risk_result" IN ('PASS', 'REVIEW_REQUIRED', 'BLOCKED')
  ),
  CONSTRAINT "approval_requests_risk_hash_check" CHECK (
    "risk_rules_hash" IS NULL OR "risk_rules_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "approval_requests_payload_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "approval_requests_decision_payload_hash_check" CHECK (
    "decision_payload_hash" IS NULL OR "decision_payload_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "approval_requests_due_after_request_check" CHECK (
    "due_at" IS NULL OR "due_at" > "requested_at"
  ),
  CONSTRAINT "approval_requests_decision_state_check" CHECK (
    ("status" = 'PENDING' AND "decided_at" IS NULL AND "decider_user_id" IS NULL AND "decision_reason" IS NULL)
    OR
    ("status" IN ('APPROVED', 'REJECTED', 'CANCELLED') AND "decided_at" IS NOT NULL
      AND "decider_user_id" IS NOT NULL AND BTRIM(COALESCE("decision_reason", '')) <> '')
    OR
    ("status" = 'EXPIRED' AND "decided_at" IS NOT NULL)
  )
);

-- Las FK de actores comprueban simultáneamente empresa, membresía y usuario.
CREATE UNIQUE INDEX "approval_requests_tenant_id_id_key"
  ON "osi"."approval_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "approval_requests_tenant_request_id_key"
  ON "osi"."approval_requests"("tenant_id", "request_id");
CREATE UNIQUE INDEX "approval_requests_tenant_decision_request_id_key"
  ON "osi"."approval_requests"("tenant_id", "decision_request_id")
  WHERE "decision_request_id" IS NOT NULL;
CREATE INDEX "approval_requests_tenant_created_at_id_idx"
  ON "osi"."approval_requests"("tenant_id", "created_at" DESC, "id" DESC);
CREATE INDEX "approval_requests_tenant_status_due_at_idx"
  ON "osi"."approval_requests"("tenant_id", "status", "due_at");
CREATE INDEX "approval_requests_tenant_entity_idx"
  ON "osi"."approval_requests"("tenant_id", "entity", "entity_id", "created_at" DESC);
CREATE INDEX "approval_requests_tenant_type_status_idx"
  ON "osi"."approval_requests"("tenant_id", "approval_type", "status");
CREATE INDEX "approval_requests_tenant_requester_idx"
  ON "osi"."approval_requests"("tenant_id", "requester_membership_id", "created_at" DESC);
CREATE INDEX "approval_requests_tenant_assignee_status_idx"
  ON "osi"."approval_requests"("tenant_id", "assigned_approver_membership_id", "status", "due_at");
CREATE INDEX "approval_requests_tenant_decider_idx"
  ON "osi"."approval_requests"("tenant_id", "decider_membership_id", "decided_at" DESC);
CREATE INDEX "approval_requests_previous_request_id_idx"
  ON "osi"."approval_requests"("tenant_id", "previous_request_id");

ALTER TABLE "osi"."approval_requests"
  ADD CONSTRAINT "approval_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."approval_requests"
  ADD CONSTRAINT "approval_requests_requester_membership_fkey"
  FOREIGN KEY ("tenant_id", "requester_membership_id", "requester_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."approval_requests"
  ADD CONSTRAINT "approval_requests_assigned_approver_membership_fkey"
  FOREIGN KEY ("tenant_id", "assigned_approver_membership_id", "assigned_approver_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."approval_requests"
  ADD CONSTRAINT "approval_requests_decider_membership_fkey"
  FOREIGN KEY ("tenant_id", "decider_membership_id", "decider_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."approval_requests"
  ADD CONSTRAINT "approval_requests_previous_request_fkey"
  FOREIGN KEY ("tenant_id", "previous_request_id")
  REFERENCES "osi"."approval_requests"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensa adicional: toda modificación válida incrementa exactamente una versión;
-- una solicitud terminal es inmutable y PENDING sólo puede pasar a un estado terminal.
CREATE FUNCTION "osi"."approval_requests_guard_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'terminal approval request is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."status" NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'invalid approval request transition' USING ERRCODE = '23514';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'approval request version must increment by one' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "approval_requests_guard_transition"
BEFORE UPDATE ON "osi"."approval_requests"
FOR EACH ROW EXECUTE FUNCTION "osi"."approval_requests_guard_transition"();
