-- V17 migration 21: tenant-first administrative identity invitations.
-- Tokens are never stored; only their SHA-256 hashes are persisted.

CREATE TYPE "osi"."AdminIdentityInvitationStatus" AS ENUM ('PENDING', 'CONSUMED', 'REVOKED');

CREATE TABLE "osi"."admin_identity_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "public_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "normalized_email" VARCHAR(320) NOT NULL,
  "intended_role" "osi"."TenantMembershipRole" NOT NULL DEFAULT 'A',
  "granted_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "token_hash" CHAR(64) NOT NULL,
  "status" "osi"."AdminIdentityInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "issued_by_membership_id" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL,
  "activated_user_id" TEXT,
  "activated_membership_id" TEXT,
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_identity_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_identity_invitations_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "admin_identity_invitations_tenant_public_ref_key" UNIQUE ("tenant_id", "public_ref"),
  CONSTRAINT "admin_identity_invitations_tenant_request_key" UNIQUE ("tenant_id", "request_id"),
  CONSTRAINT "admin_identity_invitations_role_check" CHECK ("intended_role" = 'A'),
  CONSTRAINT "admin_identity_invitations_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "admin_identity_invitations_payload_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "admin_identity_invitations_email_check" CHECK (
    "normalized_email" = lower(btrim("normalized_email"))
    AND length("normalized_email") BETWEEN 3 AND 320
  ),
  CONSTRAINT "admin_identity_invitations_expiry_check" CHECK (
    "expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '24 hours'
  ),
  CONSTRAINT "admin_identity_invitations_state_check" CHECK (
    ("status" = 'PENDING' AND "consumed_at" IS NULL AND "revoked_at" IS NULL AND "activated_user_id" IS NULL AND "activated_membership_id" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL AND "revoked_at" IS NULL AND "activated_user_id" IS NOT NULL AND "activated_membership_id" IS NOT NULL)
    OR ("status" = 'REVOKED' AND "consumed_at" IS NULL AND "revoked_at" IS NOT NULL AND "activated_user_id" IS NULL AND "activated_membership_id" IS NULL)
  )
);

ALTER TABLE "osi"."admin_identity_invitations"
  ADD CONSTRAINT "admin_identity_invitations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "admin_identity_invitations_issuer_fkey"
    FOREIGN KEY ("tenant_id", "issued_by_membership_id", "issued_by_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "admin_identity_invitations_activated_user_fkey"
    FOREIGN KEY ("activated_user_id") REFERENCES "osi"."osi_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "admin_identity_invitations_activated_membership_fkey"
    FOREIGN KEY ("tenant_id", "activated_membership_id", "activated_user_id")
    REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "admin_identity_invitations_one_pending_email_key"
  ON "osi"."admin_identity_invitations" ("tenant_id", "normalized_email")
  WHERE "status" = 'PENDING';

CREATE INDEX "admin_identity_invitations_tenant_email_status_idx"
  ON "osi"."admin_identity_invitations" ("tenant_id", "normalized_email", "status");

CREATE INDEX "admin_identity_invitations_tenant_status_expires_idx"
  ON "osi"."admin_identity_invitations" ("tenant_id", "status", "expires_at");

CREATE FUNCTION "osi"."admin_identity_invitations_reject_identity_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."public_ref" IS DISTINCT FROM OLD."public_ref"
     OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."normalized_email" IS DISTINCT FROM OLD."normalized_email"
     OR NEW."intended_role" IS DISTINCT FROM OLD."intended_role"
     OR NEW."granted_permissions" IS DISTINCT FROM OLD."granted_permissions"
     OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
     OR NEW."issued_by_membership_id" IS DISTINCT FROM OLD."issued_by_membership_id"
     OR NEW."issued_by_user_id" IS DISTINCT FROM OLD."issued_by_user_id"
     OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
     OR NEW."payload_hash" IS DISTINCT FROM OLD."payload_hash"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'AdminIdentityInvitation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "admin_identity_invitations_identity_immutable"
BEFORE UPDATE ON "osi"."admin_identity_invitations"
FOR EACH ROW EXECUTE FUNCTION "osi"."admin_identity_invitations_reject_identity_mutation"();
