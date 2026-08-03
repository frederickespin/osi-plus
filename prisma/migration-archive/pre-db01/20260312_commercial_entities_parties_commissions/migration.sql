-- Focused migration: commercial entities, lead parties, commissions
-- Safe for incremental rollout over existing schema.

-- Enums
DO $$ BEGIN
  CREATE TYPE "EntityKind" AS ENUM ('COMPANY','PERSON');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EntityTypeCode" AS ENUM ('CLIENT','CORPORATE','ACCOUNT','PARTNER','AGENT','REFERRER','SUPPLIER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadSourceChannel" AS ENUM ('WHATSAPP','PHONE','EMAIL','WEB','REFERRAL','PARTNER','CORPORATE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD','CONTACTADO','SURVEY_PENDIENTE','SURVEY_REALIZADO','COTIZANDO','PROPUESTA_ENVIADA','FOLLOW_UP','GANADO','PERDIDO','EXPEDIENTE_ABIERTO','EN_COORDINACION','LISTO_PARA_HANDOFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadPartyRole" AS ENUM ('CLIENT','BILL_TO','ACCOUNT','PARTNER','REFERRER','CORPORATE_OWNER','AGENT_ORIGIN','AGENT_DESTINATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionType" AS ENUM ('PERCENT','FIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionStatus" AS ENUM ('PENDING','APPROVED','PAYABLE','PAID','VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommissionAppliesTo" AS ENUM ('LEAD','INVOICE','COLLECTION','MARGIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialServiceType" AS ENUM ('EXPORT','IMPORT','LOCAL_ORIGIN','LOCAL_DESTINATION','LOCAL_INTERNAL','STORAGE','CRATING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AddressRole" AS ENUM ('ORIGIN','DESTINATION','PICKUP_LOCAL','DELIVERY_LOCAL','STORAGE_LOCATION','BILLING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RequirementStatus" AS ENUM ('PENDING','RECEIVED','APPROVED','NOT_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lead new columns (mapped model fields)
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "source_channel_v2" "LeadSourceChannel";
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "stage_v2" "LeadStage";
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "service_scope_v2" "CommercialServiceType";

-- Tables
CREATE TABLE IF NOT EXISTS "business_entities" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "legal_name" TEXT NOT NULL,
  "trade_name" TEXT,
  "entity_kind" "EntityKind" NOT NULL,
  "tax_id" TEXT,
  "country_code" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "entity_types" (
  "id" TEXT PRIMARY KEY,
  "code" "EntityTypeCode" NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT
);

CREATE TABLE IF NOT EXISTS "business_entity_types" (
  "id" TEXT PRIMARY KEY,
  "business_entity_id" TEXT NOT NULL,
  "entity_type_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_entity_types_business_entity_id_fkey" FOREIGN KEY ("business_entity_id") REFERENCES "business_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_entity_types_entity_type_id_fkey" FOREIGN KEY ("entity_type_id") REFERENCES "entity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_entity_types_business_entity_id_entity_type_id_key" UNIQUE ("business_entity_id", "entity_type_id")
);

CREATE TABLE IF NOT EXISTS "entity_contacts" (
  "id" TEXT PRIMARY KEY,
  "business_entity_id" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "position" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "entity_contacts_business_entity_id_fkey" FOREIGN KEY ("business_entity_id") REFERENCES "business_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_parties" (
  "id" TEXT PRIMARY KEY,
  "lead_id" TEXT NOT NULL,
  "business_entity_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "role" "LeadPartyRole" NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_parties_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "osi_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_parties_business_entity_id_fkey" FOREIGN KEY ("business_entity_id") REFERENCES "business_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_parties_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "entity_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_addresses" (
  "id" TEXT PRIMARY KEY,
  "lead_id" TEXT NOT NULL,
  "address_role" "AddressRole" NOT NULL,
  "country" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postal_code" TEXT,
  "address_line1" TEXT,
  "address_line2" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_addresses_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "osi_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_services" (
  "id" TEXT PRIMARY KEY,
  "lead_id" TEXT NOT NULL,
  "service_type" "CommercialServiceType" NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "sequence" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_services_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "osi_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_service_requirements" (
  "id" TEXT PRIMARY KEY,
  "lead_service_id" TEXT NOT NULL,
  "requirement_key" TEXT NOT NULL,
  "status" "RequirementStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_service_requirements_lead_service_id_fkey" FOREIGN KEY ("lead_service_id") REFERENCES "lead_services"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_stage_history" (
  "id" TEXT PRIMARY KEY,
  "lead_id" TEXT NOT NULL,
  "from_stage" "LeadStage",
  "to_stage" "LeadStage" NOT NULL,
  "changed_by_user_id" TEXT,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "osi_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "commission_agreements" (
  "id" TEXT PRIMARY KEY,
  "business_entity_id" TEXT NOT NULL,
  "applies_to" "CommissionAppliesTo" NOT NULL,
  "commission_type" "CommissionType" NOT NULL,
  "commission_value" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "service_type" "CommercialServiceType",
  "valid_from" TIMESTAMP(3),
  "valid_to" TIMESTAMP(3),
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_agreements_business_entity_id_fkey" FOREIGN KEY ("business_entity_id") REFERENCES "business_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "lead_commissions" (
  "id" TEXT PRIMARY KEY,
  "lead_id" TEXT NOT NULL,
  "referral_entity_id" TEXT NOT NULL,
  "commission_agreement_id" TEXT,
  "base_amount" DECIMAL(14,2) NOT NULL,
  "commission_type" "CommissionType" NOT NULL,
  "commission_value" DECIMAL(12,2) NOT NULL,
  "commission_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_commissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "osi_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_commissions_referral_entity_id_fkey" FOREIGN KEY ("referral_entity_id") REFERENCES "business_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "lead_commissions_commission_agreement_id_fkey" FOREIGN KEY ("commission_agreement_id") REFERENCES "commission_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "osi_leads_stage_v2_updatedAt_idx" ON "osi_leads"("stage_v2", "updatedAt");
CREATE INDEX IF NOT EXISTS "osi_leads_source_channel_v2_updatedAt_idx" ON "osi_leads"("source_channel_v2", "updatedAt");

CREATE INDEX IF NOT EXISTS "business_entities_legal_name_idx" ON "business_entities"("legal_name");
CREATE INDEX IF NOT EXISTS "business_entities_entity_kind_is_active_idx" ON "business_entities"("entity_kind", "is_active");

CREATE INDEX IF NOT EXISTS "business_entity_types_entity_type_id_idx" ON "business_entity_types"("entity_type_id");
CREATE INDEX IF NOT EXISTS "entity_contacts_business_entity_id_is_primary_idx" ON "entity_contacts"("business_entity_id", "is_primary");

CREATE INDEX IF NOT EXISTS "lead_parties_lead_id_role_idx" ON "lead_parties"("lead_id", "role");
CREATE INDEX IF NOT EXISTS "lead_parties_business_entity_id_idx" ON "lead_parties"("business_entity_id");
CREATE INDEX IF NOT EXISTS "lead_parties_contact_id_idx" ON "lead_parties"("contact_id");

CREATE INDEX IF NOT EXISTS "lead_addresses_lead_id_address_role_idx" ON "lead_addresses"("lead_id", "address_role");
CREATE INDEX IF NOT EXISTS "lead_services_lead_id_service_type_idx" ON "lead_services"("lead_id", "service_type");
CREATE INDEX IF NOT EXISTS "lead_service_requirements_lead_service_id_status_idx" ON "lead_service_requirements"("lead_service_id", "status");
CREATE INDEX IF NOT EXISTS "lead_stage_history_lead_id_created_at_idx" ON "lead_stage_history"("lead_id", "created_at");
CREATE INDEX IF NOT EXISTS "lead_stage_history_to_stage_created_at_idx" ON "lead_stage_history"("to_stage", "created_at");

CREATE INDEX IF NOT EXISTS "commission_agreements_business_entity_id_is_active_idx" ON "commission_agreements"("business_entity_id", "is_active");
CREATE INDEX IF NOT EXISTS "lead_commissions_lead_id_status_idx" ON "lead_commissions"("lead_id", "status");
CREATE INDEX IF NOT EXISTS "lead_commissions_referral_entity_id_status_idx" ON "lead_commissions"("referral_entity_id", "status");
