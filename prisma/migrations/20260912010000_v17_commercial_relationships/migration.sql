SET search_path = osi, public;

CREATE TYPE "CommercialEntityKind" AS ENUM ('PERSON','COMPANY','ORGANIZATION','AGENT','LEAD_ACCOUNT','SUPPLIER','REFERRER','THIRD_PARTY','ASSOCIATION');
CREATE TYPE "CommercialRecordStatus" AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE "CommercialRelationshipType" AS ENUM ('EMPLOYED_BY','LEAD_ACCOUNT','BOOKER','PAYER','APPROVER','REFERRER','AGENT','SUPPLIER','ASSOCIATED_WITH');
CREATE TYPE "CommercialVersionState" AS ENUM ('DRAFT','PUBLISHED','SUPERSEDED','INACTIVE');
CREATE TYPE "CommercialPriceAdjustmentKind" AS ENUM ('DISCOUNT','ADMINISTRATIVE_CHARGE');
CREATE TYPE "CommercialCalculationType" AS ENUM ('PERCENTAGE','FIXED_AMOUNT','POLICY');
CREATE TYPE "CommercialCommissionKind" AS ENUM ('INTERNAL','EXTERNAL_REFERRAL');
CREATE TYPE "CommercialCasePartyRole" AS ENUM ('COMPANY','LEAD_ACCOUNT','BOOKER','PAYER','APPROVER','REFERRER','AGENT','SUPPLIER');

CREATE TABLE "commercial_entities" (
  "id" TEXT NOT NULL,
  "entity_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT,
  "code" VARCHAR(64) NOT NULL,
  "display_name" VARCHAR(200) NOT NULL,
  "legal_name" VARCHAR(240),
  "kind" "CommercialEntityKind" NOT NULL,
  "country_code" CHAR(2),
  "tax_reference_normalized" VARCHAR(64),
  "status" "CommercialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_entity_contacts" (
  "id" TEXT NOT NULL,
  "contact_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "position" VARCHAR(120),
  "email_normalized" VARCHAR(320),
  "phone_normalized" VARCHAR(32),
  "preferred_channel" VARCHAR(32),
  "status" "CommercialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_entity_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_relationships" (
  "id" TEXT NOT NULL,
  "relationship_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "source_entity_id" TEXT NOT NULL,
  "target_entity_id" TEXT NOT NULL,
  "type" "CommercialRelationshipType" NOT NULL,
  "reference" VARCHAR(120),
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "status" "CommercialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_tariff_versions" (
  "id" TEXT NOT NULL,
  "tariff_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL,
  "scope" JSONB NOT NULL,
  "rate_definition" JSONB NOT NULL,
  "logical_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_tariff_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_pricing_agreement_versions" (
  "id" TEXT NOT NULL,
  "agreement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT,
  "relationship_id" TEXT,
  "tariff_version_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "service_scope" JSONB NOT NULL,
  "mode_scope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "administrative_terms" JSONB NOT NULL DEFAULT '{}',
  "logical_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_pricing_agreement_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_price_adjustments" (
  "id" TEXT NOT NULL,
  "adjustment_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "pricing_agreement_id" TEXT NOT NULL,
  "kind" "CommercialPriceAdjustmentKind" NOT NULL,
  "calculation_type" "CommercialCalculationType" NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "base" VARCHAR(80) NOT NULL,
  "reason_code" VARCHAR(80) NOT NULL,
  "approval_ref" UUID,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_price_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_referral_agreement_versions" (
  "id" TEXT NOT NULL,
  "referral_agreement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "referrer_entity_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "calculation_type" "CommercialCalculationType" NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "currency" CHAR(3),
  "basis_policy" JSONB NOT NULL,
  "service_scope" JSONB NOT NULL,
  "authorization_ref" UUID,
  "reference" VARCHAR(120) NOT NULL,
  "logical_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_referral_agreement_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_commission_agreement_versions" (
  "id" TEXT NOT NULL,
  "commission_agreement_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "beneficiary_entity_id" TEXT NOT NULL,
  "referral_agreement_id" TEXT,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "kind" "CommercialCommissionKind" NOT NULL,
  "calculation_type" "CommercialCalculationType" NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "currency" CHAR(3),
  "basis_policy" JSONB NOT NULL,
  "service_scope" JSONB NOT NULL,
  "logical_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_commission_agreement_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_association_memberships" (
  "id" TEXT NOT NULL,
  "membership_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "member_entity_id" TEXT NOT NULL,
  "association_entity_id" TEXT NOT NULL,
  "membership_number" VARCHAR(120),
  "status" "CommercialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_association_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_certifications" (
  "id" TEXT NOT NULL,
  "certification_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "type" VARCHAR(120) NOT NULL,
  "issuer" VARCHAR(200) NOT NULL,
  "document_ref" UUID,
  "issued_at" DATE,
  "expires_at" DATE,
  "status" "CommercialRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "commercial_certifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_instruction_versions" (
  "id" TEXT NOT NULL,
  "instruction_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "entity_id" TEXT,
  "relationship_id" TEXT,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "category" VARCHAR(80) NOT NULL,
  "service_scope" JSONB NOT NULL,
  "content" JSONB NOT NULL,
  "logical_sha256" CHAR(64) NOT NULL,
  "valid_from" TIMESTAMPTZ(6),
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "commercial_instruction_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_case_commercial_context_versions" (
  "id" TEXT NOT NULL,
  "context_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "series_ref" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "pipeline_case_id" TEXT NOT NULL,
  "pricing_agreement_id" TEXT,
  "referral_agreement_id" TEXT,
  "version" INTEGER NOT NULL,
  "state" "CommercialVersionState" NOT NULL DEFAULT 'DRAFT',
  "associations_snapshot" JSONB NOT NULL DEFAULT '[]',
  "instructions_snapshot" JSONB NOT NULL DEFAULT '[]',
  "logical_sha256" CHAR(64) NOT NULL,
  "created_by_membership_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "pipeline_case_commercial_context_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_case_commercial_parties" (
  "id" TEXT NOT NULL,
  "party_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "context_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "relationship_id" TEXT,
  "role" "CommercialCasePartyRole" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_case_commercial_parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_relationship_commands" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "target_ref" UUID,
  "result_json" JSONB NOT NULL,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_relationship_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_relationship_events" (
  "id" TEXT NOT NULL,
  "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "aggregate_type" VARCHAR(80) NOT NULL,
  "aggregate_ref" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "request_id" VARCHAR(191) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_relationship_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_entities_tenant_id_key" ON "commercial_entities"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_entities_tenant_ref_key" ON "commercial_entities"("tenant_id","entity_ref");
CREATE UNIQUE INDEX "commercial_entities_tenant_code_key" ON "commercial_entities"("tenant_id","code");
CREATE UNIQUE INDEX "commercial_entities_tenant_client_key" ON "commercial_entities"("tenant_id","client_id");
CREATE INDEX "commercial_entities_catalog_idx" ON "commercial_entities"("tenant_id","kind","status","display_name");
CREATE UNIQUE INDEX "commercial_entity_contacts_tenant_id_key" ON "commercial_entity_contacts"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_entity_contacts_tenant_ref_key" ON "commercial_entity_contacts"("tenant_id","contact_ref");
CREATE INDEX "commercial_entity_contacts_entity_idx" ON "commercial_entity_contacts"("tenant_id","entity_id","status");
CREATE UNIQUE INDEX "commercial_relationships_tenant_id_key" ON "commercial_relationships"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_relationships_tenant_ref_key" ON "commercial_relationships"("tenant_id","relationship_ref");
CREATE INDEX "commercial_relationships_source_idx" ON "commercial_relationships"("tenant_id","source_entity_id","type","status");
CREATE INDEX "commercial_relationships_target_idx" ON "commercial_relationships"("tenant_id","target_entity_id","type","status");
CREATE UNIQUE INDEX "commercial_relationships_active_compatibility_key" ON "commercial_relationships"("tenant_id","source_entity_id","target_entity_id","type") WHERE "status"='ACTIVE';
CREATE UNIQUE INDEX "commercial_tariff_versions_tenant_id_key" ON "commercial_tariff_versions"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_tariff_versions_tenant_ref_key" ON "commercial_tariff_versions"("tenant_id","tariff_ref");
CREATE UNIQUE INDEX "commercial_tariff_versions_series_version_key" ON "commercial_tariff_versions"("tenant_id","series_ref","version");
CREATE INDEX "commercial_tariff_versions_active_idx" ON "commercial_tariff_versions"("tenant_id","state","valid_from","valid_to");
CREATE UNIQUE INDEX "commercial_pricing_agreements_tenant_id_key" ON "commercial_pricing_agreement_versions"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_pricing_agreements_tenant_ref_key" ON "commercial_pricing_agreement_versions"("tenant_id","agreement_ref");
CREATE UNIQUE INDEX "commercial_pricing_agreements_series_version_key" ON "commercial_pricing_agreement_versions"("tenant_id","series_ref","version");
CREATE INDEX "commercial_pricing_agreements_entity_idx" ON "commercial_pricing_agreement_versions"("tenant_id","entity_id","state","valid_from","valid_to");
CREATE INDEX "commercial_pricing_agreements_relationship_idx" ON "commercial_pricing_agreement_versions"("tenant_id","relationship_id","state","valid_from","valid_to");
CREATE UNIQUE INDEX "commercial_price_adjustments_tenant_ref_key" ON "commercial_price_adjustments"("tenant_id","adjustment_ref");
CREATE INDEX "commercial_price_adjustments_agreement_idx" ON "commercial_price_adjustments"("tenant_id","pricing_agreement_id","kind");
CREATE UNIQUE INDEX "commercial_referral_agreements_tenant_id_key" ON "commercial_referral_agreement_versions"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_referral_agreements_tenant_ref_key" ON "commercial_referral_agreement_versions"("tenant_id","referral_agreement_ref");
CREATE UNIQUE INDEX "commercial_referral_agreements_series_version_key" ON "commercial_referral_agreement_versions"("tenant_id","series_ref","version");
CREATE INDEX "commercial_referral_agreements_referrer_idx" ON "commercial_referral_agreement_versions"("tenant_id","referrer_entity_id","state","valid_from","valid_to");
CREATE UNIQUE INDEX "commercial_commission_agreements_tenant_id_key" ON "commercial_commission_agreement_versions"("tenant_id","id");
CREATE UNIQUE INDEX "commercial_commission_agreements_tenant_ref_key" ON "commercial_commission_agreement_versions"("tenant_id","commission_agreement_ref");
CREATE UNIQUE INDEX "commercial_commission_agreements_series_version_key" ON "commercial_commission_agreement_versions"("tenant_id","series_ref","version");
CREATE INDEX "commercial_commission_agreements_beneficiary_idx" ON "commercial_commission_agreement_versions"("tenant_id","beneficiary_entity_id","kind","state");
CREATE UNIQUE INDEX "commercial_association_memberships_tenant_ref_key" ON "commercial_association_memberships"("tenant_id","membership_ref");
CREATE INDEX "commercial_association_memberships_member_idx" ON "commercial_association_memberships"("tenant_id","member_entity_id","status");
CREATE UNIQUE INDEX "commercial_certifications_tenant_ref_key" ON "commercial_certifications"("tenant_id","certification_ref");
CREATE INDEX "commercial_certifications_entity_idx" ON "commercial_certifications"("tenant_id","entity_id","status","expires_at");
CREATE UNIQUE INDEX "commercial_instructions_tenant_ref_key" ON "commercial_instruction_versions"("tenant_id","instruction_ref");
CREATE UNIQUE INDEX "commercial_instructions_series_version_key" ON "commercial_instruction_versions"("tenant_id","series_ref","version");
CREATE INDEX "commercial_instructions_entity_idx" ON "commercial_instruction_versions"("tenant_id","entity_id","state","valid_from","valid_to");
CREATE UNIQUE INDEX "pipeline_case_commercial_contexts_tenant_id_key" ON "pipeline_case_commercial_context_versions"("tenant_id","id");
CREATE UNIQUE INDEX "pipeline_case_commercial_contexts_tenant_ref_key" ON "pipeline_case_commercial_context_versions"("tenant_id","context_ref");
CREATE UNIQUE INDEX "pipeline_case_commercial_contexts_series_version_key" ON "pipeline_case_commercial_context_versions"("tenant_id","series_ref","version");
CREATE INDEX "pipeline_case_commercial_contexts_case_idx" ON "pipeline_case_commercial_context_versions"("tenant_id","pipeline_case_id","state","version" DESC);
CREATE UNIQUE INDEX "pipeline_case_commercial_parties_tenant_ref_key" ON "pipeline_case_commercial_parties"("tenant_id","party_ref");
CREATE UNIQUE INDEX "pipeline_case_commercial_parties_role_key" ON "pipeline_case_commercial_parties"("tenant_id","context_id","role");
CREATE INDEX "pipeline_case_commercial_parties_entity_idx" ON "pipeline_case_commercial_parties"("tenant_id","entity_id","role");
CREATE UNIQUE INDEX "commercial_relationship_commands_request_key" ON "commercial_relationship_commands"("tenant_id","request_id");
CREATE INDEX "commercial_relationship_commands_target_idx" ON "commercial_relationship_commands"("tenant_id","target_ref","created_at");
CREATE UNIQUE INDEX "commercial_relationship_events_tenant_ref_key" ON "commercial_relationship_events"("tenant_id","event_ref");
CREATE INDEX "commercial_relationship_events_aggregate_idx" ON "commercial_relationship_events"("tenant_id","aggregate_ref","created_at" DESC);

ALTER TABLE "commercial_entities"
  ADD CONSTRAINT "commercial_entities_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_entities_client_fkey" FOREIGN KEY ("tenant_id","client_id") REFERENCES "osi_clients"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_entities_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "commercial_entities_version_check" CHECK ("version" > 0);
ALTER TABLE "commercial_entity_contacts"
  ADD CONSTRAINT "commercial_entity_contacts_entity_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_entity_contacts_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "commercial_entity_contacts_version_check" CHECK ("version" > 0);
ALTER TABLE "commercial_relationships"
  ADD CONSTRAINT "commercial_relationships_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_relationships_source_fkey" FOREIGN KEY ("tenant_id","source_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_relationships_target_fkey" FOREIGN KEY ("tenant_id","target_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_relationships_distinct_check" CHECK ("source_entity_id" <> "target_entity_id"),
  ADD CONSTRAINT "commercial_relationships_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "commercial_relationships_version_check" CHECK ("version" > 0);
ALTER TABLE "commercial_tariff_versions"
  ADD CONSTRAINT "commercial_tariff_versions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_tariff_versions_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "commercial_tariff_versions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "commercial_tariff_versions_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "commercial_tariff_versions_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "commercial_tariff_versions_published_check" CHECK (("state"='PUBLISHED') = ("published_at" IS NOT NULL));
ALTER TABLE "commercial_pricing_agreement_versions"
  ADD CONSTRAINT "commercial_pricing_agreements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_pricing_agreements_entity_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_pricing_agreements_relationship_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "commercial_relationships"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_pricing_agreements_tariff_fkey" FOREIGN KEY ("tenant_id","tariff_version_id") REFERENCES "commercial_tariff_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_pricing_agreements_target_check" CHECK (num_nonnulls("entity_id","relationship_id")=1),
  ADD CONSTRAINT "commercial_pricing_agreements_version_check" CHECK ("version">0),
  ADD CONSTRAINT "commercial_pricing_agreements_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "commercial_pricing_agreements_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "commercial_pricing_agreements_published_check" CHECK (("state"='PUBLISHED')=("published_at" IS NOT NULL));
ALTER TABLE "commercial_price_adjustments"
  ADD CONSTRAINT "commercial_price_adjustments_agreement_fkey" FOREIGN KEY ("tenant_id","pricing_agreement_id") REFERENCES "commercial_pricing_agreement_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_price_adjustments_value_check" CHECK ("value">=0 AND ("calculation_type"<>'PERCENTAGE' OR "value"<=100)),
  ADD CONSTRAINT "commercial_price_adjustments_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from");
ALTER TABLE "commercial_referral_agreement_versions"
  ADD CONSTRAINT "commercial_referral_agreements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_referral_agreements_referrer_fkey" FOREIGN KEY ("tenant_id","referrer_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_referral_agreements_value_check" CHECK ("value">=0 AND ("calculation_type"<>'PERCENTAGE' OR "value"<=100)),
  ADD CONSTRAINT "commercial_referral_agreements_currency_check" CHECK (("calculation_type"='FIXED_AMOUNT')=("currency" IS NOT NULL)),
  ADD CONSTRAINT "commercial_referral_agreements_version_check" CHECK ("version">0),
  ADD CONSTRAINT "commercial_referral_agreements_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "commercial_referral_agreements_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "commercial_referral_agreements_published_check" CHECK (("state"='PUBLISHED')=("published_at" IS NOT NULL));
ALTER TABLE "commercial_commission_agreement_versions"
  ADD CONSTRAINT "commercial_commission_agreements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_commission_agreements_beneficiary_fkey" FOREIGN KEY ("tenant_id","beneficiary_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_commission_agreements_referral_fkey" FOREIGN KEY ("tenant_id","referral_agreement_id") REFERENCES "commercial_referral_agreement_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_commission_agreements_kind_check" CHECK (("kind"='EXTERNAL_REFERRAL')=("referral_agreement_id" IS NOT NULL)),
  ADD CONSTRAINT "commercial_commission_agreements_value_check" CHECK ("value">=0 AND ("calculation_type"<>'PERCENTAGE' OR "value"<=100)),
  ADD CONSTRAINT "commercial_commission_agreements_currency_check" CHECK (("calculation_type"='FIXED_AMOUNT')=("currency" IS NOT NULL)),
  ADD CONSTRAINT "commercial_commission_agreements_version_check" CHECK ("version">0),
  ADD CONSTRAINT "commercial_commission_agreements_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "commercial_commission_agreements_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "commercial_commission_agreements_published_check" CHECK (("state"='PUBLISHED')=("published_at" IS NOT NULL));
ALTER TABLE "commercial_association_memberships"
  ADD CONSTRAINT "commercial_association_memberships_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_association_memberships_member_fkey" FOREIGN KEY ("tenant_id","member_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_association_memberships_association_fkey" FOREIGN KEY ("tenant_id","association_entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_association_memberships_distinct_check" CHECK ("member_entity_id"<>"association_entity_id"),
  ADD CONSTRAINT "commercial_association_memberships_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "commercial_association_memberships_version_check" CHECK ("version">0);
ALTER TABLE "commercial_certifications"
  ADD CONSTRAINT "commercial_certifications_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_certifications_entity_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_certifications_period_check" CHECK ("expires_at" IS NULL OR "issued_at" IS NULL OR "expires_at">"issued_at"),
  ADD CONSTRAINT "commercial_certifications_version_check" CHECK ("version">0);
ALTER TABLE "commercial_instruction_versions"
  ADD CONSTRAINT "commercial_instructions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_instructions_entity_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_instructions_relationship_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "commercial_relationships"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_instructions_target_check" CHECK (num_nonnulls("entity_id","relationship_id")=1),
  ADD CONSTRAINT "commercial_instructions_version_check" CHECK ("version">0),
  ADD CONSTRAINT "commercial_instructions_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "commercial_instructions_period_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to">"valid_from"),
  ADD CONSTRAINT "commercial_instructions_published_check" CHECK (("state"='PUBLISHED')=("published_at" IS NOT NULL));
ALTER TABLE "pipeline_case_commercial_context_versions"
  ADD CONSTRAINT "pipeline_case_commercial_contexts_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_contexts_case_fkey" FOREIGN KEY ("tenant_id","pipeline_case_id") REFERENCES "osi_pipeline_cases"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_contexts_pricing_fkey" FOREIGN KEY ("tenant_id","pricing_agreement_id") REFERENCES "commercial_pricing_agreement_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_contexts_referral_fkey" FOREIGN KEY ("tenant_id","referral_agreement_id") REFERENCES "commercial_referral_agreement_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_contexts_version_check" CHECK ("version">0),
  ADD CONSTRAINT "pipeline_case_commercial_contexts_hash_check" CHECK ("logical_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "pipeline_case_commercial_contexts_published_check" CHECK (("state"='PUBLISHED')=("published_at" IS NOT NULL));
ALTER TABLE "pipeline_case_commercial_parties"
  ADD CONSTRAINT "pipeline_case_commercial_parties_context_fkey" FOREIGN KEY ("tenant_id","context_id") REFERENCES "pipeline_case_commercial_context_versions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_parties_entity_fkey" FOREIGN KEY ("tenant_id","entity_id") REFERENCES "commercial_entities"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pipeline_case_commercial_parties_relationship_fkey" FOREIGN KEY ("tenant_id","relationship_id") REFERENCES "commercial_relationships"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_relationship_commands"
  ADD CONSTRAINT "commercial_relationship_commands_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "commercial_relationship_commands_hash_check" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "commercial_relationship_events"
  ADD CONSTRAINT "commercial_relationship_events_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "commercial_relationship_public_identity_immutable"() RETURNS trigger AS $$
BEGIN
  IF to_jsonb(NEW)->>TG_ARGV[0] IS DISTINCT FROM to_jsonb(OLD)->>TG_ARGV[0] THEN RAISE EXCEPTION 'COMMERCIAL_PUBLIC_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "commercial_relationship_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'COMMERCIAL_RELATIONSHIP_APPEND_ONLY' USING ERRCODE='23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "commercial_entities_public_ref_immutable" BEFORE UPDATE ON "commercial_entities" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_public_identity_immutable"('entity_ref');
CREATE TRIGGER "commercial_entity_contacts_public_ref_immutable" BEFORE UPDATE ON "commercial_entity_contacts" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_public_identity_immutable"('contact_ref');
CREATE TRIGGER "commercial_relationships_public_ref_immutable" BEFORE UPDATE ON "commercial_relationships" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_public_identity_immutable"('relationship_ref');
CREATE TRIGGER "commercial_association_memberships_public_ref_immutable" BEFORE UPDATE ON "commercial_association_memberships" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_public_identity_immutable"('membership_ref');
CREATE TRIGGER "commercial_certifications_public_ref_immutable" BEFORE UPDATE ON "commercial_certifications" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_public_identity_immutable"('certification_ref');
CREATE TRIGGER "commercial_tariff_versions_append_only" BEFORE UPDATE OR DELETE ON "commercial_tariff_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_pricing_agreements_append_only" BEFORE UPDATE OR DELETE ON "commercial_pricing_agreement_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_price_adjustments_append_only" BEFORE UPDATE OR DELETE ON "commercial_price_adjustments" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_referral_agreements_append_only" BEFORE UPDATE OR DELETE ON "commercial_referral_agreement_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_commission_agreements_append_only" BEFORE UPDATE OR DELETE ON "commercial_commission_agreement_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_instructions_append_only" BEFORE UPDATE OR DELETE ON "commercial_instruction_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "pipeline_case_commercial_contexts_append_only" BEFORE UPDATE OR DELETE ON "pipeline_case_commercial_context_versions" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "pipeline_case_commercial_parties_append_only" BEFORE UPDATE OR DELETE ON "pipeline_case_commercial_parties" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_relationship_commands_append_only" BEFORE UPDATE OR DELETE ON "commercial_relationship_commands" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
CREATE TRIGGER "commercial_relationship_events_append_only" BEFORE UPDATE OR DELETE ON "commercial_relationship_events" FOR EACH ROW EXECUTE FUNCTION "commercial_relationship_append_only"();
