-- MT-01A — Tenant and memberships.
-- Additive only: existing users and authorization behavior remain unchanged.

CREATE TYPE "osi"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE "osi"."TenantMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
CREATE TYPE "osi"."TenantMembershipRole" AS ENUM (
  'A', 'V', 'K', 'B', 'C', 'C1', 'D', 'E', 'G', 'N',
  'PA', 'PB', 'PC', 'PD', 'PF', 'I', 'PE'
);
CREATE TYPE "osi"."TenantProvisioningSource" AS ENUM ('MANUAL', 'BACKFILL');

CREATE TABLE "osi"."tenants" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "legal_name" VARCHAR(200),
  "country_code" CHAR(2),
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Santo_Domingo',
  "default_currency" CHAR(3) NOT NULL DEFAULT 'DOP',
  "status" "osi"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  "provisioning_source" "osi"."TenantProvisioningSource" NOT NULL DEFAULT 'MANUAL',
  "provisioning_batch_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_code_normalized_check" CHECK ("code" = UPPER(BTRIM("code")))
);

CREATE TABLE "osi"."tenant_memberships" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "osi"."TenantMembershipRole" NOT NULL,
  "status" "osi"."TenantMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "granted_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denied_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "authorization_version" INTEGER NOT NULL DEFAULT 1,
  "first_access_at" TIMESTAMP(3),
  "last_access_at" TIMESTAMP(3),
  "provisioning_source" "osi"."TenantProvisioningSource" NOT NULL DEFAULT 'MANUAL',
  "provisioning_batch_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_memberships_authorization_version_check" CHECK ("authorization_version" >= 1),
  CONSTRAINT "tenant_memberships_permissions_no_overlap_check"
    CHECK (NOT ("granted_permissions" && "denied_permissions"))
);

CREATE UNIQUE INDEX "tenants_code_key" ON "osi"."tenants"("code");
CREATE INDEX "tenants_status_idx" ON "osi"."tenants"("status");
CREATE INDEX "tenants_provisioning_batch_id_idx" ON "osi"."tenants"("provisioning_batch_id");
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key"
  ON "osi"."tenant_memberships"("tenant_id", "user_id");
CREATE UNIQUE INDEX "tenant_memberships_one_default_per_user"
  ON "osi"."tenant_memberships"("user_id") WHERE "is_default" = true;
CREATE INDEX "tenant_memberships_tenant_id_status_role_idx"
  ON "osi"."tenant_memberships"("tenant_id", "status", "role");
CREATE INDEX "tenant_memberships_user_id_status_idx"
  ON "osi"."tenant_memberships"("user_id", "status");
CREATE INDEX "tenant_memberships_user_id_is_default_idx"
  ON "osi"."tenant_memberships"("user_id", "is_default");
CREATE INDEX "tenant_memberships_provisioning_batch_id_idx"
  ON "osi"."tenant_memberships"("provisioning_batch_id");

ALTER TABLE "osi"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "osi"."osi_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
