-- V17 19F: append-only habitual driver history and scoped temporary authority.
-- Additive only. Existing Vehicle, ApprovalRequest and migration SQL are unchanged.

CREATE TABLE "osi"."fleet_driver_primary_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "driver_membership_id" TEXT,
  "driver_user_id" TEXT,
  "assigned_by_membership_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_id" UUID NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  CONSTRAINT "fleet_driver_primary_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fleet_driver_primary_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "fleet_driver_primary_driver_pair_check" CHECK (("driver_membership_id" IS NULL) = ("driver_user_id" IS NULL)),
  CONSTRAINT "fleet_driver_primary_reason_check" CHECK (BTRIM("reason") <> ''),
  CONSTRAINT "fleet_driver_primary_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "fleet_driver_primary_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_primary_vehicle_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "osi"."osi_vehicles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_primary_driver_fkey" FOREIGN KEY ("tenant_id", "driver_membership_id", "driver_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_primary_actor_fkey" FOREIGN KEY ("tenant_id", "assigned_by_membership_id", "assigned_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "fleet_driver_primary_tenant_id_key" ON "osi"."fleet_driver_primary_events"("tenant_id", "id");
CREATE UNIQUE INDEX "fleet_driver_primary_request_key" ON "osi"."fleet_driver_primary_events"("tenant_id", "request_id");
CREATE UNIQUE INDEX "fleet_driver_primary_revision_key" ON "osi"."fleet_driver_primary_events"("tenant_id", "vehicle_id", "revision");
CREATE INDEX "fleet_driver_primary_driver_idx" ON "osi"."fleet_driver_primary_events"("tenant_id", "driver_membership_id", "assigned_at" DESC);
CREATE INDEX "fleet_driver_primary_actor_idx" ON "osi"."fleet_driver_primary_events"("tenant_id", "assigned_by_membership_id", "assigned_at" DESC);

CREATE FUNCTION "osi"."fleet_driver_primary_immutable"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'habitual driver events are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "fleet_driver_primary_immutable" BEFORE UPDATE OR DELETE ON "osi"."fleet_driver_primary_events"
FOR EACH ROW EXECUTE FUNCTION "osi"."fleet_driver_primary_immutable"();

CREATE TABLE "osi"."fleet_driver_authorizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "driver_membership_id" TEXT NOT NULL,
  "driver_user_id" TEXT NOT NULL,
  "approval_request_id" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "scope_hash" CHAR(64) NOT NULL,
  "requested_by_membership_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "request_id" UUID NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "decision_action" VARCHAR(12),
  "decision_request_id" UUID,
  "decision_payload_hash" CHAR(64),
  "authorized_at" TIMESTAMPTZ(3),
  "authorized_by_membership_id" TEXT,
  "authorized_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_by_membership_id" TEXT,
  "revoked_by_user_id" TEXT,
  "revocation_reason" VARCHAR(500),
  "revocation_request_id" UUID,
  "revocation_payload_hash" CHAR(64),
  "row_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fleet_driver_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fleet_driver_authorization_interval_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "fleet_driver_authorization_hashes_check" CHECK (
    "scope_hash" ~ '^[0-9a-f]{64}$' AND "payload_hash" ~ '^[0-9a-f]{64}$'
    AND ("decision_payload_hash" IS NULL OR "decision_payload_hash" ~ '^[0-9a-f]{64}$')
    AND ("revocation_payload_hash" IS NULL OR "revocation_payload_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "fleet_driver_authorization_decision_check" CHECK (
    ("decision_action" IS NULL AND "decision_request_id" IS NULL AND "decision_payload_hash" IS NULL)
    OR ("decision_action" IS NOT NULL AND "decision_action" IN ('APPROVE', 'REJECT') AND "decision_request_id" IS NOT NULL AND "decision_payload_hash" IS NOT NULL)
  ),
  CONSTRAINT "fleet_driver_authorization_seal_check" CHECK (
    ("authorized_at" IS NULL AND "authorized_by_membership_id" IS NULL AND "authorized_by_user_id" IS NULL AND "decision_action" IS DISTINCT FROM 'APPROVE')
    OR ("authorized_at" IS NOT NULL AND "authorized_by_membership_id" IS NOT NULL AND "authorized_by_user_id" IS NOT NULL
      AND "decision_action" IS NOT NULL AND "decision_action" = 'APPROVE' AND "authorized_by_user_id" <> "driver_user_id"
      AND "authorized_at" < "ends_at")
  ),
  CONSTRAINT "fleet_driver_authorization_revocation_check" CHECK (
    ("revoked_at" IS NULL AND "revoked_by_membership_id" IS NULL AND "revoked_by_user_id" IS NULL
      AND "revocation_reason" IS NULL AND "revocation_request_id" IS NULL AND "revocation_payload_hash" IS NULL)
    OR ("revoked_at" IS NOT NULL AND "revoked_by_membership_id" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL
      AND BTRIM(COALESCE("revocation_reason", '')) <> '' AND "revocation_request_id" IS NOT NULL AND "revocation_payload_hash" IS NOT NULL
      AND "authorized_at" IS NOT NULL AND "revoked_at" >= "authorized_at")
  ),
  CONSTRAINT "fleet_driver_authorization_version_check" CHECK (
    "row_version" = 1 + CASE WHEN "decision_action" IS NULL THEN 0 ELSE 1 END + CASE WHEN "revoked_at" IS NULL THEN 0 ELSE 1 END
  ),
  CONSTRAINT "fleet_driver_authorization_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_vehicle_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "osi"."osi_vehicles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_driver_fkey" FOREIGN KEY ("tenant_id", "driver_membership_id", "driver_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_approval_fkey" FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "osi"."approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_requester_fkey" FOREIGN KEY ("tenant_id", "requested_by_membership_id", "requested_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_authorizer_fkey" FOREIGN KEY ("tenant_id", "authorized_by_membership_id", "authorized_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "fleet_driver_authorization_revoker_fkey" FOREIGN KEY ("tenant_id", "revoked_by_membership_id", "revoked_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "fleet_driver_authorization_tenant_id_key" ON "osi"."fleet_driver_authorizations"("tenant_id", "id");
CREATE UNIQUE INDEX "fleet_driver_authorization_request_key" ON "osi"."fleet_driver_authorizations"("tenant_id", "request_id");
CREATE UNIQUE INDEX "fleet_driver_authorization_approval_key" ON "osi"."fleet_driver_authorizations"("tenant_id", "approval_request_id");
CREATE UNIQUE INDEX "fleet_driver_authorization_decision_request_key" ON "osi"."fleet_driver_authorizations"("tenant_id", "decision_request_id") WHERE "decision_request_id" IS NOT NULL;
CREATE UNIQUE INDEX "fleet_driver_authorization_revocation_request_key" ON "osi"."fleet_driver_authorizations"("tenant_id", "revocation_request_id") WHERE "revocation_request_id" IS NOT NULL;
CREATE INDEX "fleet_driver_authorization_vehicle_idx" ON "osi"."fleet_driver_authorizations"("tenant_id", "vehicle_id", "created_at" DESC, "id" DESC);
CREATE INDEX "fleet_driver_authorization_driver_idx" ON "osi"."fleet_driver_authorizations"("tenant_id", "driver_membership_id", "starts_at", "ends_at");
CREATE INDEX "fleet_driver_authorization_requester_idx" ON "osi"."fleet_driver_authorizations"("tenant_id", "requested_by_membership_id");
CREATE INDEX "fleet_driver_authorization_authorizer_idx" ON "osi"."fleet_driver_authorizations"("tenant_id", "authorized_by_membership_id");
CREATE INDEX "fleet_driver_authorization_revoker_idx" ON "osi"."fleet_driver_authorizations"("tenant_id", "revoked_by_membership_id");

CREATE FUNCTION "osi"."fleet_driver_authorization_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE approval_row "osi"."approval_requests"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'temporary driver authorization history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO approval_row FROM "osi"."approval_requests"
    WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."approval_request_id";
  IF NOT FOUND OR approval_row."approval_type" IS DISTINCT FROM 'FLEET_DRIVER_TEMPORARY'
    OR approval_row."entity" IS DISTINCT FROM 'FLEET_DRIVER_AUTHORIZATION' OR approval_row."entity_id" IS DISTINCT FROM NEW."id"::text
    OR approval_row."request_id" IS DISTINCT FROM NEW."request_id"::text
    OR approval_row."requester_membership_id" IS DISTINCT FROM NEW."requested_by_membership_id"
    OR approval_row."requester_user_id" IS DISTINCT FROM NEW."requested_by_user_id"
    OR approval_row."evaluation_snapshot_json"->>'fleetDriverScopeHash' IS DISTINCT FROM NEW."scope_hash"::text
  THEN
    RAISE EXCEPTION 'temporary driver approval scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."row_version" <> 1 OR NEW."decision_action" IS NOT NULL OR NEW."authorized_at" IS NOT NULL
      OR NEW."revoked_at" IS NOT NULL OR approval_row."status" <> 'PENDING' THEN
      RAISE EXCEPTION 'temporary driver authorization must start pending and unsealed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW."id", NEW."tenant_id", NEW."vehicle_id", NEW."driver_membership_id", NEW."driver_user_id",
      NEW."approval_request_id", NEW."starts_at", NEW."ends_at", NEW."scope_hash", NEW."requested_by_membership_id",
      NEW."requested_by_user_id", NEW."request_id", NEW."payload_hash", NEW."created_at")
    IS DISTINCT FROM ROW(OLD."id", OLD."tenant_id", OLD."vehicle_id", OLD."driver_membership_id", OLD."driver_user_id",
      OLD."approval_request_id", OLD."starts_at", OLD."ends_at", OLD."scope_hash", OLD."requested_by_membership_id",
      OLD."requested_by_user_id", OLD."request_id", OLD."payload_hash", OLD."created_at") THEN
    RAISE EXCEPTION 'temporary driver scope is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."row_version" <> OLD."row_version" + 1 THEN
    RAISE EXCEPTION 'temporary driver version must increment by one' USING ERRCODE = '40001';
  END IF;
  IF OLD."decision_action" IS NULL AND NEW."decision_action" IS NOT NULL THEN
    IF NEW."revoked_at" IS NOT NULL
      OR approval_row."decision_request_id" IS DISTINCT FROM NEW."decision_request_id"::text
      OR (NEW."decision_action" = 'APPROVE' AND (approval_row."status" <> 'APPROVED'
        OR NEW."authorized_by_membership_id" IS DISTINCT FROM approval_row."decider_membership_id"
        OR NEW."authorized_by_user_id" IS DISTINCT FROM approval_row."decider_user_id"
        OR approval_row."decided_at" IS NULL OR NEW."authorized_at" < (approval_row."decided_at" AT TIME ZONE 'UTC')))
      OR (NEW."decision_action" = 'REJECT' AND approval_row."status" <> 'REJECTED') THEN
      RAISE EXCEPTION 'temporary driver decision is not bound to its approval' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."decision_action" = 'APPROVE' AND OLD."revoked_at" IS NULL AND NEW."revoked_at" IS NOT NULL THEN
    IF ROW(NEW."decision_action", NEW."decision_request_id", NEW."decision_payload_hash", NEW."authorized_at",
        NEW."authorized_by_membership_id", NEW."authorized_by_user_id")
      IS DISTINCT FROM ROW(OLD."decision_action", OLD."decision_request_id", OLD."decision_payload_hash", OLD."authorized_at",
        OLD."authorized_by_membership_id", OLD."authorized_by_user_id") THEN
      RAISE EXCEPTION 'temporary driver approval seal is immutable' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'temporary driver authorization transition is final or invalid' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "fleet_driver_authorization_guard" BEFORE INSERT OR UPDATE OR DELETE ON "osi"."fleet_driver_authorizations"
FOR EACH ROW EXECUTE FUNCTION "osi"."fleet_driver_authorization_guard"();
