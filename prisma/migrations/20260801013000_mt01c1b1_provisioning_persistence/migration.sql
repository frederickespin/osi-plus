-- MT-01C1B1 — Persistencia empresarial inactiva de provisión.
-- Cambio estrictamente aditivo: no activa servicios, invitaciones ni consumidores runtime.

CREATE TYPE "osi"."EmployeeProvisioningIdentityMode" AS ENUM (
  'NEW_GLOBAL_USER',
  'EXISTING_GLOBAL_USER'
);

CREATE TYPE "osi"."EmployeeProvisioningLifecycleStatus" AS ENUM (
  'IDENTITY_PENDING',
  'PROVISIONED_INACTIVE',
  'ACTIVE',
  'REVOKED',
  'TERMINATED'
);

CREATE TYPE "osi"."EmployeeProvisioningInvitationStatus" AS ENUM (
  'ISSUED',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED'
);

ALTER TABLE "osi"."osi_users"
  ADD COLUMN "normalized_email" VARCHAR(320);

ALTER TABLE "osi"."osi_users"
  ADD CONSTRAINT "osi_users_normalized_email_canonical_check" CHECK (
    "normalized_email" IS NULL OR (
      "normalized_email" = LOWER(BTRIM("normalized_email"))
      AND "normalized_email" ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$'
      AND "normalized_email" !~ '[^ -~]'
    )
  );

CREATE TABLE "osi"."employee_provisioning_requests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "approval_request_id" TEXT NOT NULL,
  "identity_mode" "osi"."EmployeeProvisioningIdentityMode" NOT NULL,
  "normalized_email" VARCHAR(320) NOT NULL,
  "normalized_employee_code" VARCHAR(64) NOT NULL,
  "job_title" VARCHAR(120),
  "department_code" VARCHAR(64),
  "employment_status" "osi"."EmployeeEmploymentStatus" NOT NULL,
  "contract_type" "osi"."EmployeeContractType",
  "availability_status" "osi"."EmployeeAvailabilityStatus" NOT NULL,
  "supervisor_membership_id" TEXT,
  "supervisor_user_id" TEXT,
  "hired_at" DATE,
  "contract_starts_at" DATE,
  "contract_ends_at" DATE,
  "terminated_at" DATE,
  "requested_role" "osi"."TenantMembershipRole" NOT NULL,
  "granted_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denied_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lifecycle_status" "osi"."EmployeeProvisioningLifecycleStatus",
  "lifecycle_version" INTEGER NOT NULL DEFAULT 0,
  "provisioned_user_id" TEXT,
  "provisioned_membership_id" TEXT,
  "provisioned_at" TIMESTAMPTZ(6),
  "activated_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "terminated_lifecycle_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_provisioning_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_provisioning_requests_email_check" CHECK (
    "normalized_email" = LOWER(BTRIM("normalized_email"))
    AND "normalized_email" ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$'
    AND "normalized_email" !~ '[^ -~]'
  ),
  CONSTRAINT "employee_provisioning_requests_employee_code_check" CHECK (
    "normalized_employee_code" = UPPER(BTRIM("normalized_employee_code"))
    AND BTRIM("normalized_employee_code") <> ''
  ),
  CONSTRAINT "employee_provisioning_requests_permissions_check" CHECK (
    NOT ("granted_permissions" && "denied_permissions")
  ),
  CONSTRAINT "employee_provisioning_requests_supervisor_pair_check" CHECK (
    ("supervisor_membership_id" IS NULL) = ("supervisor_user_id" IS NULL)
  ),
  CONSTRAINT "employee_provisioning_requests_provisioned_pair_check" CHECK (
    ("provisioned_membership_id" IS NULL) = ("provisioned_user_id" IS NULL)
  ),
  CONSTRAINT "employee_provisioning_requests_contract_dates_check" CHECK (
    "contract_ends_at" IS NULL OR "contract_starts_at" IS NULL OR "contract_ends_at" >= "contract_starts_at"
  ),
  CONSTRAINT "employee_provisioning_requests_hire_dates_check" CHECK (
    ("contract_starts_at" IS NULL OR "hired_at" IS NULL OR "contract_starts_at" >= "hired_at")
    AND ("contract_ends_at" IS NULL OR "hired_at" IS NULL OR "contract_ends_at" >= "hired_at")
    AND ("terminated_at" IS NULL OR "hired_at" IS NULL OR "terminated_at" >= "hired_at")
  ),
  CONSTRAINT "employee_provisioning_requests_employment_termination_check" CHECK (
    ("employment_status" = 'TERMINATED' AND "terminated_at" IS NOT NULL)
    OR ("employment_status" <> 'TERMINATED' AND "terminated_at" IS NULL)
  ),
  CONSTRAINT "employee_provisioning_requests_lifecycle_version_check" CHECK (
    ("lifecycle_status" IS NULL AND "lifecycle_version" = 0)
    OR ("lifecycle_status" IS NOT NULL AND "lifecycle_version" >= 1)
  ),
  CONSTRAINT "employee_provisioning_requests_lifecycle_check" CHECK (
    ("lifecycle_status" IS NULL AND "lifecycle_version" = 0
      AND "provisioned_membership_id" IS NULL AND "provisioned_at" IS NULL
      AND "activated_at" IS NULL AND "revoked_at" IS NULL AND "terminated_lifecycle_at" IS NULL)
    OR ("lifecycle_status" = 'IDENTITY_PENDING' AND "lifecycle_version" >= 1
      AND "provisioned_membership_id" IS NULL AND "provisioned_at" IS NULL
      AND "activated_at" IS NULL AND "revoked_at" IS NULL AND "terminated_lifecycle_at" IS NULL)
    OR ("lifecycle_status" = 'PROVISIONED_INACTIVE' AND "lifecycle_version" >= 1
      AND "provisioned_membership_id" IS NOT NULL AND "provisioned_at" IS NOT NULL
      AND "activated_at" IS NULL AND "revoked_at" IS NULL AND "terminated_lifecycle_at" IS NULL)
    OR ("lifecycle_status" = 'ACTIVE' AND "lifecycle_version" >= 1
      AND "provisioned_membership_id" IS NOT NULL AND "provisioned_at" IS NOT NULL
      AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL AND "terminated_lifecycle_at" IS NULL)
    OR ("lifecycle_status" = 'REVOKED' AND "lifecycle_version" >= 1
      AND "provisioned_membership_id" IS NOT NULL AND "provisioned_at" IS NOT NULL
      AND "revoked_at" IS NOT NULL AND "terminated_lifecycle_at" IS NULL)
    OR ("lifecycle_status" = 'TERMINATED' AND "lifecycle_version" >= 1
      AND "provisioned_membership_id" IS NOT NULL AND "provisioned_at" IS NOT NULL
      AND "terminated_lifecycle_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "employee_provisioning_requests_tenant_id_id_key"
  ON "osi"."employee_provisioning_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "employee_provisioning_requests_tenant_approval_key"
  ON "osi"."employee_provisioning_requests"("tenant_id", "approval_request_id");
CREATE INDEX "employee_provisioning_requests_tenant_lifecycle_created_idx"
  ON "osi"."employee_provisioning_requests"("tenant_id", "lifecycle_status", "created_at" DESC);
CREATE INDEX "employee_provisioning_requests_tenant_email_idx"
  ON "osi"."employee_provisioning_requests"("tenant_id", "normalized_email");
CREATE INDEX "employee_provisioning_requests_tenant_employee_code_idx"
  ON "osi"."employee_provisioning_requests"("tenant_id", "normalized_employee_code");
CREATE INDEX "employee_provisioning_requests_tenant_provisioned_membership_idx"
  ON "osi"."employee_provisioning_requests"("tenant_id", "provisioned_membership_id");

ALTER TABLE "osi"."employee_provisioning_requests"
  ADD CONSTRAINT "employee_provisioning_requests_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_requests_approval_fkey"
  FOREIGN KEY ("tenant_id", "approval_request_id") REFERENCES "osi"."approval_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_requests_supervisor_fkey"
  FOREIGN KEY ("tenant_id", "supervisor_membership_id", "supervisor_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_requests_provisioned_membership_fkey"
  FOREIGN KEY ("tenant_id", "provisioned_membership_id", "provisioned_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "osi"."employee_provisioning_invitations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provisioning_request_id" TEXT NOT NULL,
  "token_hmac" CHAR(64) NOT NULL,
  "status" "osi"."EmployeeProvisioningInvitationStatus" NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "issued_by_membership_id" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL,
  "issue_request_id" VARCHAR(191) NOT NULL,
  "issue_payload_hash" CHAR(64) NOT NULL,
  "acceptance_request_id" VARCHAR(191),
  "acceptance_payload_hash" CHAR(64),
  "accepted_user_id" TEXT,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_provisioning_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_provisioning_invitations_hmac_check" CHECK ("token_hmac" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "employee_provisioning_invitations_issue_hash_check" CHECK ("issue_payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "employee_provisioning_invitations_acceptance_pair_check" CHECK (
    ("acceptance_request_id" IS NULL) = ("acceptance_payload_hash" IS NULL)
    AND ("acceptance_payload_hash" IS NULL OR "acceptance_payload_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "employee_provisioning_invitations_attempts_check" CHECK (
    "max_attempts" BETWEEN 1 AND 20 AND "attempt_count" BETWEEN 0 AND "max_attempts"
  ),
  CONSTRAINT "employee_provisioning_invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "employee_provisioning_invitations_event_times_check" CHECK (
    ("accepted_at" IS NULL OR ("accepted_at" >= "created_at" AND "accepted_at" <= "expires_at"))
    AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    AND ("expired_at" IS NULL OR "expired_at" >= "expires_at")
  ),
  CONSTRAINT "employee_provisioning_invitations_state_check" CHECK (
    ("status" = 'ISSUED' AND "accepted_user_id" IS NULL AND "accepted_at" IS NULL
      AND "revoked_at" IS NULL AND "expired_at" IS NULL AND "acceptance_request_id" IS NULL)
    OR ("status" = 'ACCEPTED' AND "accepted_user_id" IS NOT NULL AND "accepted_at" IS NOT NULL
      AND "revoked_at" IS NULL AND "expired_at" IS NULL AND "acceptance_request_id" IS NOT NULL)
    OR ("status" = 'REVOKED' AND "accepted_user_id" IS NULL AND "accepted_at" IS NULL
      AND "revoked_at" IS NOT NULL AND "expired_at" IS NULL AND "acceptance_request_id" IS NULL)
    OR ("status" = 'EXPIRED' AND "accepted_user_id" IS NULL AND "accepted_at" IS NULL
      AND "revoked_at" IS NULL AND "expired_at" IS NOT NULL AND "acceptance_request_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "employee_provisioning_invitations_tenant_id_id_key"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "id");
CREATE UNIQUE INDEX "employee_provisioning_invitations_token_hmac_key"
  ON "osi"."employee_provisioning_invitations"("token_hmac");
CREATE UNIQUE INDEX "employee_provisioning_invitations_tenant_issue_request_key"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "issue_request_id");
CREATE UNIQUE INDEX "employee_provisioning_invitations_tenant_acceptance_request_key"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "acceptance_request_id");
CREATE UNIQUE INDEX "employee_provisioning_invitations_one_issued_per_request"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "provisioning_request_id")
  WHERE "status" = 'ISSUED';
CREATE INDEX "employee_provisioning_invitations_tenant_request_created_idx"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "provisioning_request_id", "created_at" DESC);
CREATE INDEX "employee_provisioning_invitations_tenant_status_expires_idx"
  ON "osi"."employee_provisioning_invitations"("tenant_id", "status", "expires_at");

ALTER TABLE "osi"."employee_provisioning_invitations"
  ADD CONSTRAINT "employee_provisioning_invitations_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_invitations_request_fkey"
  FOREIGN KEY ("tenant_id", "provisioning_request_id") REFERENCES "osi"."employee_provisioning_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_invitations_issuer_fkey"
  FOREIGN KEY ("tenant_id", "issued_by_membership_id", "issued_by_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_provisioning_invitations_accepted_user_fkey"
  FOREIGN KEY ("accepted_user_id") REFERENCES "osi"."osi_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "osi"."employee_admin_role_proposals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provisioning_request_id" TEXT NOT NULL,
  "proposed_role" "osi"."TenantMembershipRole" NOT NULL,
  "proposer_membership_id" TEXT NOT NULL,
  "proposer_user_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "granted_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denied_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_admin_role_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_admin_role_proposals_role_check" CHECK ("proposed_role" = 'A'),
  CONSTRAINT "employee_admin_role_proposals_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "employee_admin_role_proposals_permissions_check" CHECK (
    NOT ("granted_permissions" && "denied_permissions")
  )
);

CREATE UNIQUE INDEX "employee_admin_role_proposals_tenant_id_id_key"
  ON "osi"."employee_admin_role_proposals"("tenant_id", "id");
CREATE UNIQUE INDEX "employee_admin_role_proposals_tenant_request_key"
  ON "osi"."employee_admin_role_proposals"("tenant_id", "request_id");
CREATE INDEX "employee_admin_role_proposals_tenant_provisioning_created_idx"
  ON "osi"."employee_admin_role_proposals"("tenant_id", "provisioning_request_id", "created_at" DESC);
CREATE INDEX "employee_admin_role_proposals_tenant_proposer_created_idx"
  ON "osi"."employee_admin_role_proposals"("tenant_id", "proposer_membership_id", "created_at" DESC);

ALTER TABLE "osi"."employee_admin_role_proposals"
  ADD CONSTRAINT "employee_admin_role_proposals_tenant_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_admin_role_proposals_request_fkey"
  FOREIGN KEY ("tenant_id", "provisioning_request_id") REFERENCES "osi"."employee_provisioning_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_admin_role_proposals_proposer_fkey"
  FOREIGN KEY ("tenant_id", "proposer_membership_id", "proposer_user_id") REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "osi"."employee_provisioning_request_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  approval_status "osi"."ApprovalRequestStatus";
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."approval_request_id" IS DISTINCT FROM OLD."approval_request_id"
  ) THEN
    RAISE EXCEPTION 'employee provisioning request identity is immutable' USING ERRCODE = '23514';
  END IF;

  IF NEW."lifecycle_status" IS NOT NULL THEN
    SELECT "status" INTO approval_status
      FROM "osi"."approval_requests"
      WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."approval_request_id";
    IF approval_status IS DISTINCT FROM 'APPROVED'::"osi"."ApprovalRequestStatus" THEN
      RAISE EXCEPTION 'employee provisioning lifecycle requires approved request' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_provisioning_request_guard_trigger"
BEFORE INSERT OR UPDATE ON "osi"."employee_provisioning_requests"
FOR EACH ROW EXECUTE FUNCTION "osi"."employee_provisioning_request_guard"();

CREATE OR REPLACE FUNCTION "osi"."employee_provisioning_invitation_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."provisioning_request_id" IS DISTINCT FROM OLD."provisioning_request_id"
    OR NEW."token_hmac" IS DISTINCT FROM OLD."token_hmac"
    OR NEW."issue_request_id" IS DISTINCT FROM OLD."issue_request_id"
    OR NEW."issue_payload_hash" IS DISTINCT FROM OLD."issue_payload_hash"
  ) THEN
    RAISE EXCEPTION 'employee provisioning invitation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_provisioning_invitation_guard_trigger"
BEFORE UPDATE ON "osi"."employee_provisioning_invitations"
FOR EACH ROW EXECUTE FUNCTION "osi"."employee_provisioning_invitation_guard"();

CREATE OR REPLACE FUNCTION "osi"."employee_admin_role_proposal_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'employee admin role proposals are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "employee_admin_role_proposal_append_only_trigger"
BEFORE UPDATE OR DELETE ON "osi"."employee_admin_role_proposals"
FOR EACH ROW EXECUTE FUNCTION "osi"."employee_admin_role_proposal_append_only"();
