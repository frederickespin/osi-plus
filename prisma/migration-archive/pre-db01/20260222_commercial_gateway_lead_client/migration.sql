-- Commercial Data Gateway (Lead -> Client -> Project)
-- Incremental migration for existing production schema.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadType') THEN
    CREATE TYPE "LeadType" AS ENUM ('L1', 'L2', 'L3', 'L4');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AcceptanceStatus') THEN
    CREATE TYPE "AcceptanceStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadConversionStatus') THEN
    CREATE TYPE "LeadConversionStatus" AS ENUM ('PENDING', 'READY', 'CONVERTED', 'SENT_TO_K');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycDocumentType') THEN
    CREATE TYPE "KycDocumentType" AS ENUM (
      'PASSPORT_ID',
      'POWER_OF_ATTORNEY',
      'VALUATION_LETTER',
      'COMPLIANCE_CHECKLIST',
      'TAX_REGISTRATION',
      'OTHER'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycDocumentStatus') THEN
    CREATE TYPE "KycDocumentStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'REJECTED');
  END IF;
END
$$;

ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "fiscalName" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "billingAddress" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "accountsPayableName" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "accountsPayableEmail" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "accountsPayablePhone" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "complianceNotes" TEXT;
ALTER TABLE "osi_clients" ADD COLUMN IF NOT EXISTS "kycCompleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "osi_projects" ADD COLUMN IF NOT EXISTS "fileNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "osi_projects_fileNumber_key" ON "osi_projects" ("fileNumber");

CREATE TABLE IF NOT EXISTS "osi_leads" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "leadType" "LeadType",
  "channel" TEXT,
  "clientName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "preliminaryOriginAddress" TEXT,
  "estimatedServiceType" TEXT,
  "estimatedMoveDate" TEXT,
  "pstCode" TEXT,
  "originAddress" TEXT,
  "destinationAddress" TEXT,
  "originFloor" TEXT,
  "destinationFloor" TEXT,
  "accessType" TEXT,
  "allowedTimeWindow" TEXT,
  "serviceResponsibleName" TEXT,
  "paymentResponsibleName" TEXT,
  "billingCompanyName" TEXT,
  "surveyMethod" TEXT,
  "geoDistanceKm" DOUBLE PRECISION,
  "geoValidated" BOOLEAN NOT NULL DEFAULT false,
  "viaticInformed" BOOLEAN NOT NULL DEFAULT false,
  "acceptanceStatus" "AcceptanceStatus" NOT NULL DEFAULT 'PENDING',
  "acceptanceEvidence" TEXT,
  "acceptanceNote" TEXT,
  "conversionStatus" "LeadConversionStatus" NOT NULL DEFAULT 'PENDING',
  "confirmedServiceDate" TEXT,
  "lostReason" TEXT,
  "lostReasonNote" TEXT,
  "fiscalData" JSONB,
  "kycRequired" BOOLEAN NOT NULL DEFAULT false,
  "kycCompleted" BOOLEAN NOT NULL DEFAULT false,
  "nestingRequired" BOOLEAN NOT NULL DEFAULT false,
  "nestingCompleted" BOOLEAN NOT NULL DEFAULT false,
  "fileNumber" TEXT,
  "convertedAt" TIMESTAMP(3),
  "sentToKAt" TIMESTAMP(3),
  "gatewayCompletedAt" TIMESTAMP(3),
  "createdByRole" TEXT,
  "updatedByRole" TEXT,
  "customerId" TEXT,
  "projectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_leads_code_key" ON "osi_leads" ("code");
CREATE INDEX IF NOT EXISTS "osi_leads_status_updatedAt_idx" ON "osi_leads" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "osi_leads_leadType_conversionStatus_idx" ON "osi_leads" ("leadType", "conversionStatus");
CREATE INDEX IF NOT EXISTS "osi_leads_customerId_idx" ON "osi_leads" ("customerId");
CREATE INDEX IF NOT EXISTS "osi_leads_projectId_idx" ON "osi_leads" ("projectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_leads_customerId_fkey'
  ) THEN
    ALTER TABLE "osi_leads"
      ADD CONSTRAINT "osi_leads_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "osi_clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_leads_projectId_fkey'
  ) THEN
    ALTER TABLE "osi_leads"
      ADD CONSTRAINT "osi_leads_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "osi_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_kyc_documents" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "clientId" TEXT,
  "type" "KycDocumentType" NOT NULL,
  "url" TEXT NOT NULL,
  "status" "KycDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "note" TEXT,
  "uploadedByRole" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),

  CONSTRAINT "osi_kyc_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_kyc_documents_leadId_type_idx" ON "osi_kyc_documents" ("leadId", "type");
CREATE INDEX IF NOT EXISTS "osi_kyc_documents_clientId_type_idx" ON "osi_kyc_documents" ("clientId", "type");
CREATE INDEX IF NOT EXISTS "osi_kyc_documents_status_uploadedAt_idx" ON "osi_kyc_documents" ("status", "uploadedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_kyc_documents_leadId_fkey'
  ) THEN
    ALTER TABLE "osi_kyc_documents"
      ADD CONSTRAINT "osi_kyc_documents_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "osi_leads"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_kyc_documents_clientId_fkey'
  ) THEN
    ALTER TABLE "osi_kyc_documents"
      ADD CONSTRAINT "osi_kyc_documents_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "osi_clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_lead_audit_logs" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_lead_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_lead_audit_logs_leadId_createdAt_idx" ON "osi_lead_audit_logs" ("leadId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_lead_audit_logs_leadId_fkey'
  ) THEN
    ALTER TABLE "osi_lead_audit_logs"
      ADD CONSTRAINT "osi_lead_audit_logs_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "osi_leads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_lead_audit_logs_actorId_fkey'
  ) THEN
    ALTER TABLE "osi_lead_audit_logs"
      ADD CONSTRAINT "osi_lead_audit_logs_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "osi_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
