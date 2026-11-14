CREATE TYPE "CustomerStorageAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED', 'CANCELLED');
CREATE TYPE "StorageBillingPartyType" AS ENUM ('CLIENT', 'COMPANY', 'THIRD_PARTY');
CREATE TYPE "StorageBillingFrequency" AS ENUM ('MONTHLY', 'WEEKLY', 'QUARTERLY', 'CUSTOM');
CREATE TYPE "StorageCapacityBasis" AS ENUM ('TWENTY_FOOT_CONTAINER', 'FORTY_FOOT_CONTAINER', 'CUBIC_METER', 'FIXED_SPACE', 'CUSTOM');

CREATE TABLE "customer_storage_agreements" (
  "id" TEXT NOT NULL,
  "agreement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "service_revision_id" TEXT NOT NULL,
  "accepted_quote_revision_id" TEXT NOT NULL,
  "agreement_code" VARCHAR(64) NOT NULL,
  "status" "CustomerStorageAgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "holder_name" VARCHAR(200) NOT NULL,
  "identity_type" VARCHAR(40) NOT NULL,
  "identity_number_masked" VARCHAR(40) NOT NULL,
  "identity_evidence_ref" VARCHAR(191) NOT NULL,
  "billing_party_type" "StorageBillingPartyType" NOT NULL,
  "billing_name" VARCHAR(200) NOT NULL,
  "billing_tax_id" VARCHAR(40),
  "billing_email" VARCHAR(320) NOT NULL,
  "billing_address" VARCHAR(500) NOT NULL,
  "billing_currency" CHAR(3) NOT NULL,
  "billing_frequency" "StorageBillingFrequency" NOT NULL DEFAULT 'MONTHLY',
  "invoice_day" INTEGER NOT NULL,
  "start_date" DATE NOT NULL,
  "estimated_duration_months" INTEGER NOT NULL,
  "estimated_end_date" DATE NOT NULL,
  "capacity_basis" "StorageCapacityBasis" NOT NULL,
  "capacity_quantity" DECIMAL(12,3) NOT NULL,
  "terms_version" VARCHAR(80) NOT NULL,
  "acceptance_evidence_ref" VARCHAR(191),
  "accepted_at" TIMESTAMPTZ(6),
  "signed_at" TIMESTAMPTZ(6),
  "activated_at" TIMESTAMPTZ(6),
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "activated_by_membership_id" TEXT,
  "activated_by_user_id" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_storage_agreements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_storage_agreements_invoice_day_check" CHECK ("invoice_day" BETWEEN 1 AND 28),
  CONSTRAINT "customer_storage_agreements_duration_check" CHECK ("estimated_duration_months" BETWEEN 1 AND 600),
  CONSTRAINT "customer_storage_agreements_capacity_check" CHECK ("capacity_quantity" > 0),
  CONSTRAINT "customer_storage_agreements_dates_check" CHECK ("estimated_end_date" >= "start_date"),
  CONSTRAINT "customer_storage_agreements_actor_pair_check" CHECK (("activated_by_membership_id" IS NULL) = ("activated_by_user_id" IS NULL)),
  CONSTRAINT "customer_storage_agreements_active_evidence_check" CHECK (
    "status" <> 'ACTIVE' OR (
      "acceptance_evidence_ref" IS NOT NULL AND
      "accepted_at" IS NOT NULL AND
      "signed_at" IS NOT NULL AND
      "activated_at" IS NOT NULL AND
      "activated_by_membership_id" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "customer_storage_agreements_tenant_id_key" ON "customer_storage_agreements"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_storage_agreements_tenant_ref_key" ON "customer_storage_agreements"("tenant_id", "agreement_ref");
CREATE UNIQUE INDEX "customer_storage_agreements_code_key" ON "customer_storage_agreements"("tenant_id", "agreement_code");
CREATE UNIQUE INDEX "customer_storage_agreements_quote_key" ON "customer_storage_agreements"("tenant_id", "accepted_quote_revision_id");
CREATE UNIQUE INDEX "customer_storage_agreements_active_case_key" ON "customer_storage_agreements"("tenant_id", "pipeline_case_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "customer_storage_agreements_case_status_idx" ON "customer_storage_agreements"("tenant_id", "pipeline_case_id", "status", "created_at" DESC);
CREATE INDEX "customer_storage_agreements_client_status_idx" ON "customer_storage_agreements"("tenant_id", "client_id", "status", "start_date");

ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_client_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "osi_clients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_case_client_fkey" FOREIGN KEY ("tenant_id", "pipeline_case_id", "client_id") REFERENCES "osi_pipeline_cases"("tenant_id", "id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_service_revision_fkey" FOREIGN KEY ("tenant_id", "service_revision_id") REFERENCES "pipeline_case_service_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_quote_revision_fkey" FOREIGN KEY ("tenant_id", "accepted_quote_revision_id") REFERENCES "quote_proposal_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_creator_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id", "created_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_storage_agreements" ADD CONSTRAINT "customer_storage_agreements_activator_fkey" FOREIGN KEY ("tenant_id", "activated_by_membership_id", "activated_by_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_storage_authorizations" ADD COLUMN "storage_agreement_id" TEXT;
CREATE INDEX "customer_storage_authorizations_agreement_idx" ON "customer_storage_authorizations"("tenant_id", "storage_agreement_id", "movement_type", "status");
ALTER TABLE "customer_storage_authorizations" ADD CONSTRAINT "customer_storage_authorizations_agreement_fkey" FOREIGN KEY ("tenant_id", "storage_agreement_id") REFERENCES "customer_storage_agreements"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION v17_customer_storage_agreement_context_guard() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pipeline_case_service_revisions" service_revision
    WHERE service_revision."tenant_id" = NEW."tenant_id"
      AND service_revision."id" = NEW."service_revision_id"
      AND service_revision."pipeline_case_id" = NEW."pipeline_case_id"
  ) THEN
    RAISE EXCEPTION 'V17_CUSTOMER_STORAGE_AGREEMENT_SERVICE_CASE_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "quote_proposal_revisions" quote_revision
    JOIN "quote_proposals" proposal
      ON proposal."tenant_id" = quote_revision."tenant_id"
     AND proposal."id" = quote_revision."proposal_id"
    JOIN "quote_client_decisions" decision
      ON decision."tenant_id" = quote_revision."tenant_id"
     AND decision."proposal_id" = proposal."id"
     AND decision."revision_id" = quote_revision."id"
     AND decision."decision" = 'ACCEPTED'
    WHERE quote_revision."tenant_id" = NEW."tenant_id"
      AND quote_revision."id" = NEW."accepted_quote_revision_id"
      AND proposal."pipeline_case_id" = NEW."pipeline_case_id"
  ) THEN
    RAISE EXCEPTION 'V17_CUSTOMER_STORAGE_AGREEMENT_ACCEPTED_QUOTE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "customer_storage_agreement_context_guard"
BEFORE INSERT OR UPDATE ON "customer_storage_agreements"
FOR EACH ROW EXECUTE FUNCTION v17_customer_storage_agreement_context_guard();

CREATE OR REPLACE FUNCTION v17_customer_storage_agreement_identity_guard() RETURNS trigger AS $$
BEGIN
  IF ROW(OLD."tenant_id", OLD."client_id", OLD."pipeline_case_id", OLD."service_revision_id", OLD."accepted_quote_revision_id", OLD."agreement_code")
     IS DISTINCT FROM
     ROW(NEW."tenant_id", NEW."client_id", NEW."pipeline_case_id", NEW."service_revision_id", NEW."accepted_quote_revision_id", NEW."agreement_code") THEN
    RAISE EXCEPTION 'V17_CUSTOMER_STORAGE_AGREEMENT_IDENTITY_IMMUTABLE';
  END IF;
  IF OLD."status" IN ('ENDED', 'CANCELLED') AND NEW."status" <> OLD."status" THEN
    RAISE EXCEPTION 'V17_CUSTOMER_STORAGE_AGREEMENT_TERMINAL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "customer_storage_agreement_identity_guard"
BEFORE UPDATE ON "customer_storage_agreements"
FOR EACH ROW EXECUTE FUNCTION v17_customer_storage_agreement_identity_guard();

COMMENT ON TABLE "customer_storage_agreements" IS 'Tenant-first authority bridging accepted quote, signed storage terms, monthly billing and warehouse authorization.';
COMMENT ON COLUMN "customer_storage_agreements"."identity_number_masked" IS 'Only a masked identifier is retained here; the complete document belongs to the controlled evidence reference.';
