-- Commercial owns customer identity and storage approval. Warehouse users can
-- execute only a current, tenant-scoped authorization for entry or exit.
CREATE TYPE "CustomerStorageAuthorizationType" AS ENUM ('ENTRY', 'EXIT');
CREATE TYPE "CustomerStorageAuthorizationStatus" AS ENUM ('AUTHORIZED', 'PARTIALLY_USED', 'CONSUMED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "customer_storage_authorizations" (
  "id" TEXT NOT NULL,
  "authorization_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "service_revision_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "authorization_code" VARCHAR(64) NOT NULL,
  "movement_type" "CustomerStorageAuthorizationType" NOT NULL,
  "storage_type" "CustomerStorageType" NOT NULL,
  "intake_source" "CustomerCustodyIntakeSource",
  "status" "CustomerStorageAuthorizationStatus" NOT NULL DEFAULT 'AUTHORIZED',
  "planned_at" TIMESTAMPTZ(6) NOT NULL,
  "valid_until" TIMESTAMPTZ(6) NOT NULL,
  "manifest_code" VARCHAR(80),
  "origin_text" VARCHAR(500),
  "destination_text" VARCHAR(500),
  "instructions" VARCHAR(2000),
  "authorized_by_membership_id" TEXT NOT NULL,
  "authorized_by_user_id" TEXT NOT NULL,
  "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_storage_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_storage_authorizations_validity_check" CHECK ("valid_until" > "planned_at"),
  CONSTRAINT "customer_storage_authorizations_intake_check" CHECK (("movement_type" = 'ENTRY' AND "intake_source" IS NOT NULL) OR ("movement_type" = 'EXIT' AND "intake_source" IS NULL)),
  CONSTRAINT "customer_storage_authorizations_consumed_check" CHECK (("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL) OR "status" <> 'CONSUMED')
);

CREATE UNIQUE INDEX "customer_storage_authorizations_tenant_id_key" ON "customer_storage_authorizations"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_storage_authorizations_tenant_ref_key" ON "customer_storage_authorizations"("tenant_id", "authorization_ref");
CREATE UNIQUE INDEX "customer_storage_authorizations_code_key" ON "customer_storage_authorizations"("tenant_id", "authorization_code");
CREATE INDEX "customer_storage_authorizations_available_idx" ON "customer_storage_authorizations"("tenant_id", "movement_type", "status", "valid_until");
CREATE INDEX "customer_storage_authorizations_case_idx" ON "customer_storage_authorizations"("tenant_id", "pipeline_case_id", "authorized_at" DESC);
CREATE INDEX "customer_storage_authorizations_warehouse_idx" ON "customer_storage_authorizations"("tenant_id", "warehouse_id", "movement_type", "status");

ALTER TABLE "customer_storage_authorizations"
  ADD CONSTRAINT "customer_storage_authorizations_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_authorizations_client_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "osi_clients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_authorizations_case_client_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id", "client_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_authorizations_service_revision_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_authorizations_warehouse_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_storage_authorizations_actor_fkey" FOREIGN KEY ("tenant_id", "authorized_by_membership_id", "authorized_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_storage_lots" ADD COLUMN "authorization_id" TEXT;
CREATE UNIQUE INDEX "customer_storage_lots_authorization_key" ON "customer_storage_lots"("tenant_id", "authorization_id");
ALTER TABLE "customer_storage_lots" ADD CONSTRAINT "customer_storage_lots_authorization_fkey" FOREIGN KEY ("tenant_id", "authorization_id") REFERENCES "customer_storage_authorizations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "v17_customer_storage_authorization_identity_guard"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
    OR NEW."pipeline_case_id" IS DISTINCT FROM OLD."pipeline_case_id"
    OR NEW."service_revision_id" IS DISTINCT FROM OLD."service_revision_id"
    OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
    OR NEW."authorization_code" IS DISTINCT FROM OLD."authorization_code"
    OR NEW."movement_type" IS DISTINCT FROM OLD."movement_type"
    OR NEW."storage_type" IS DISTINCT FROM OLD."storage_type"
    OR NEW."intake_source" IS DISTINCT FROM OLD."intake_source"
    OR NEW."authorized_by_membership_id" IS DISTINCT FROM OLD."authorized_by_membership_id"
    OR NEW."authorized_by_user_id" IS DISTINCT FROM OLD."authorized_by_user_id"
    OR NEW."authorized_at" IS DISTINCT FROM OLD."authorized_at" THEN
    RAISE EXCEPTION 'V17_CUSTOMER_STORAGE_AUTHORIZATION_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "customer_storage_authorizations_identity_guard"
BEFORE UPDATE ON "customer_storage_authorizations"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_storage_authorization_identity_guard"();
