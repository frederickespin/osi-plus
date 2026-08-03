-- Commercial module core schema (ServiceCase pipeline + normalized entities)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountType') THEN
    CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'AGENT', 'GOVERNMENT', 'NON_PROFIT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocationType') THEN
    CREATE TYPE "LocationType" AS ENUM ('ORIGIN', 'DESTINATION', 'WAREHOUSE', 'OFFICE', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ParkingDifficulty') THEN
    CREATE TYPE "ParkingDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LongCarryBand') THEN
    CREATE TYPE "LongCarryBand" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceCaseMode') THEN
    CREATE TYPE "ServiceCaseMode" AS ENUM ('LOCAL', 'EXPORT', 'IMPORT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceCaseCustomerType') THEN
    CREATE TYPE "ServiceCaseCustomerType" AS ENUM ('L1_AGENT', 'L2_INTL_DIRECT', 'L3_CORPORATE', 'L4_PERSONAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceCaseStatus') THEN
    CREATE TYPE "ServiceCaseStatus" AS ENUM (
      'NEW_INBOX', 'AWAITING_ICP', 'GOVERNANCE_CONFIRMED', 'REQUIREMENTS_CONFIRMED',
      'SURVEY_PLANNING', 'SURVEY_SCHEDULED', 'SURVEY_COMPLETED', 'CRATING_ESTIMATE_PENDING',
      'PRICING_IN_PROGRESS', 'INTERNAL_REVIEW', 'QUOTE_SENT', 'NEGOTIATION',
      'CHANGE_CONTROL', 'APPROVED', 'OPS_HANDOFF', 'CLOSED_WON', 'CLOSED_LOST'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyMethod') THEN
    CREATE TYPE "SurveyMethod" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'LISTADO_FOTOS', 'LISTA', 'FOTOS');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NoDestinationCaseType') THEN
    CREATE TYPE "NoDestinationCaseType" AS ENUM ('CASE_A_PACKING_ORIGIN', 'CASE_B_ORIGIN_STORAGE', 'CASE_C_PICKUP_NO_DELIVERY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuoteLevel') THEN
    CREATE TYPE "QuoteLevel" AS ENUM ('ESTIMATE', 'FINAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuoteStatus') THEN
    CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuoteBlock') THEN
    CREATE TYPE "QuoteBlock" AS ENUM ('ORIGIN', 'TRANSPORT', 'DESTINATION', 'THIRD_PARTY', 'STORAGE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuoteItemType') THEN
    CREATE TYPE "QuoteItemType" AS ENUM ('SERVICE', 'SURCHARGE', 'MATERIAL', 'CRATING', 'DISCOUNT', 'TAX');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommercialEventType') THEN
    CREATE TYPE "CommercialEventType" AS ENUM ('SURVEY', 'FOLLOW_UP', 'DEADLINE', 'SERVICE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommercialEventStatus') THEN
    CREATE TYPE "CommercialEventStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CratingRequestStatus') THEN
    CREATE TYPE "CratingRequestStatus" AS ENUM ('NEEDED', 'ESTIMATING', 'APPROVED', 'IN_PRODUCTION', 'DELIVERED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" TEXT NOT NULL,
  "account_type" "AccountType" NOT NULL,
  "legal_name" TEXT NOT NULL,
  "tax_id" TEXT,
  "default_currency" TEXT NOT NULL,
  "billing_preferences" TEXT,
  "payment_instructions" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "phones" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "emails" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "whatsapp" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "account_contacts" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "contact_id" TEXT NOT NULL,
  "relationship_role" TEXT NOT NULL,
  CONSTRAINT "account_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "locations" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "address_line" TEXT NOT NULL,
  "sector" TEXT,
  "city" TEXT NOT NULL,
  "province" TEXT,
  "country" TEXT NOT NULL,
  "geo_lat" DECIMAL(10,7),
  "geo_lng" DECIMAL(10,7),
  "location_type" "LocationType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "location_access_profiles" (
  "id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "floor_number" INTEGER,
  "elevator_available" BOOLEAN NOT NULL DEFAULT false,
  "elevator_notes" TEXT,
  "stairs_floors" INTEGER,
  "parking_difficulty" "ParkingDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "long_carry_band" "LongCarryBand" NOT NULL DEFAULT 'NONE',
  "truck_restrictions" TEXT,
  "building_rules" TEXT,
  "risk_notes" TEXT,
  "photos_asset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "location_access_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_cases" (
  "id" TEXT NOT NULL,
  "case_code" TEXT NOT NULL,
  "mode" "ServiceCaseMode" NOT NULL,
  "service_type" TEXT NOT NULL,
  "customer_type" "ServiceCaseCustomerType" NOT NULL,
  "status" "ServiceCaseStatus" NOT NULL,
  "owner_contact_id" TEXT,
  "account_id" TEXT,
  "primary_contact_id" TEXT NOT NULL,
  "payer_contact_id" TEXT,
  "approver_contact_id" TEXT,
  "origin_location_id" TEXT NOT NULL,
  "destination_location_id" TEXT,
  "blocks" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "no_destination_case_type" "NoDestinationCaseType",
  "no_destination_ack_asset_id" TEXT,
  "estimated_cbm" DECIMAL(12,3),
  "survey_method" "SurveyMethod",
  "requires_survey" BOOLEAN NOT NULL DEFAULT false,
  "service_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "case_milestones" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "first_response_at" TIMESTAMP(3),
  "icp_completed_at" TIMESTAMP(3),
  "survey_scheduled_at" TIMESTAMP(3),
  "survey_completed_at" TIMESTAMP(3),
  "estimate_sent_at" TIMESTAMP(3),
  "final_quote_sent_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "ops_handoff_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "close_reason" TEXT,
  CONSTRAINT "case_milestones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "surveys" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "survey_type" TEXT NOT NULL,
  "performed_at" TIMESTAMP(3) NOT NULL,
  "performed_by_contact_id" TEXT,
  "origin_access_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "destination_access_confirmed" BOOLEAN NOT NULL DEFAULT false,
  "volume_estimate" TEXT,
  "inventory_summary" TEXT,
  "special_handling_codes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "surcharges_possible_codes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "assumptions_codes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "evidence_asset_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "quotes" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "level" "QuoteLevel" NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "QuoteStatus" NOT NULL,
  "currency" TEXT NOT NULL,
  "payment_terms_text" TEXT,
  "assumptions_codes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "exclusions_text" TEXT,
  "change_control_text" TEXT,
  "sent_at" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "quote_line_items" (
  "id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "block" "QuoteBlock" NOT NULL,
  "item_type" "QuoteItemType" NOT NULL,
  "catalog_code" TEXT,
  "description" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "unit_price" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "evidence_required" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "events" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "event_type" "CommercialEventType" NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" "CommercialEventStatus" NOT NULL DEFAULT 'SCHEDULED',
  "assigned_to_contact_id" TEXT,
  "location_id" TEXT,
  "notes" TEXT,
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crating_requests" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "quote_id" TEXT,
  "status" "CratingRequestStatus" NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "output_cost_summary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "generated_line_item_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crating_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_surcharges" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "default_unit" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_surcharges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_special_handling" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_special_handling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_materials" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_assumptions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_assumptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_service_types" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "mode_policy" TEXT NOT NULL,
  "fixed_mode" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_service_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "catalog_service_flags" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_service_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_contacts_account_id_contact_id_relationship_role_key" ON "account_contacts" ("account_id", "contact_id", "relationship_role");
CREATE UNIQUE INDEX IF NOT EXISTS "location_access_profiles_location_id_key" ON "location_access_profiles" ("location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "service_cases_case_code_key" ON "service_cases" ("case_code");
CREATE UNIQUE INDEX IF NOT EXISTS "case_milestones_case_id_key" ON "case_milestones" ("case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_case_id_level_version_key" ON "quotes" ("case_id", "level", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_surcharges_code_key" ON "catalog_surcharges" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_special_handling_code_key" ON "catalog_special_handling" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_materials_code_key" ON "catalog_materials" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_assumptions_code_key" ON "catalog_assumptions" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_service_types_code_key" ON "catalog_service_types" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_service_flags_code_key" ON "catalog_service_flags" ("code");

CREATE INDEX IF NOT EXISTS "service_cases_mode_status_idx" ON "service_cases" ("mode", "status");
CREATE INDEX IF NOT EXISTS "service_cases_owner_contact_id_status_idx" ON "service_cases" ("owner_contact_id", "status");
CREATE INDEX IF NOT EXISTS "service_cases_created_at_idx" ON "service_cases" ("created_at");
CREATE INDEX IF NOT EXISTS "service_cases_case_code_idx" ON "service_cases" ("case_code");
CREATE INDEX IF NOT EXISTS "locations_city_sector_idx" ON "locations" ("city", "sector");
CREATE INDEX IF NOT EXISTS "events_case_id_event_type_start_at_idx" ON "events" ("case_id", "event_type", "start_at");
CREATE INDEX IF NOT EXISTS "quotes_case_id_status_sent_at_idx" ON "quotes" ("case_id", "status", "sent_at");
CREATE INDEX IF NOT EXISTS "case_milestones_final_quote_sent_at_idx" ON "case_milestones" ("final_quote_sent_at");
CREATE INDEX IF NOT EXISTS "case_milestones_first_response_at_idx" ON "case_milestones" ("first_response_at");
CREATE INDEX IF NOT EXISTS "service_cases_service_flags_gin_idx" ON "service_cases" USING GIN ("service_flags");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_contacts_account_id_fkey'
  ) THEN
    ALTER TABLE "account_contacts"
      ADD CONSTRAINT "account_contacts_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_contacts_contact_id_fkey'
  ) THEN
    ALTER TABLE "account_contacts"
      ADD CONSTRAINT "account_contacts_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'location_access_profiles_location_id_fkey'
  ) THEN
    ALTER TABLE "location_access_profiles"
      ADD CONSTRAINT "location_access_profiles_location_id_fkey"
      FOREIGN KEY ("location_id") REFERENCES "locations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_owner_contact_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_owner_contact_id_fkey"
      FOREIGN KEY ("owner_contact_id") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_account_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_primary_contact_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_primary_contact_id_fkey"
      FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_payer_contact_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_payer_contact_id_fkey"
      FOREIGN KEY ("payer_contact_id") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_approver_contact_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_approver_contact_id_fkey"
      FOREIGN KEY ("approver_contact_id") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_origin_location_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_origin_location_id_fkey"
      FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_destination_location_id_fkey'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_destination_location_id_fkey"
      FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_milestones_case_id_fkey'
  ) THEN
    ALTER TABLE "case_milestones"
      ADD CONSTRAINT "case_milestones_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "service_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surveys_case_id_fkey'
  ) THEN
    ALTER TABLE "surveys"
      ADD CONSTRAINT "surveys_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "service_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surveys_performed_by_contact_id_fkey'
  ) THEN
    ALTER TABLE "surveys"
      ADD CONSTRAINT "surveys_performed_by_contact_id_fkey"
      FOREIGN KEY ("performed_by_contact_id") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_case_id_fkey'
  ) THEN
    ALTER TABLE "quotes"
      ADD CONSTRAINT "quotes_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "service_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_items_quote_id_fkey'
  ) THEN
    ALTER TABLE "quote_line_items"
      ADD CONSTRAINT "quote_line_items_quote_id_fkey"
      FOREIGN KEY ("quote_id") REFERENCES "quotes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_case_id_fkey'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "service_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_assigned_to_contact_id_fkey'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_assigned_to_contact_id_fkey"
      FOREIGN KEY ("assigned_to_contact_id") REFERENCES "contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_location_id_fkey'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_location_id_fkey"
      FOREIGN KEY ("location_id") REFERENCES "locations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crating_requests_case_id_fkey'
  ) THEN
    ALTER TABLE "crating_requests"
      ADD CONSTRAINT "crating_requests_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "service_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crating_requests_quote_id_fkey'
  ) THEN
    ALTER TABLE "crating_requests"
      ADD CONSTRAINT "crating_requests_quote_id_fkey"
      FOREIGN KEY ("quote_id") REFERENCES "quotes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_transport_requires_destination_chk'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_transport_requires_destination_chk"
      CHECK (
        COALESCE((blocks ->> 'transport')::boolean, false) = false
        OR destination_location_id IS NOT NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_case_b_requires_destination_chk'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_case_b_requires_destination_chk"
      CHECK (
        no_destination_case_type IS NULL
        OR no_destination_case_type <> 'CASE_B_ORIGIN_STORAGE'
        OR destination_location_id IS NOT NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_cases_case_c_requires_ack_chk'
  ) THEN
    ALTER TABLE "service_cases"
      ADD CONSTRAINT "service_cases_case_c_requires_ack_chk"
      CHECK (
        no_destination_case_type IS NULL
        OR no_destination_case_type <> 'CASE_C_PICKUP_NO_DELIVERY'
        OR no_destination_ack_asset_id IS NOT NULL
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_end_after_start_chk'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_end_after_start_chk"
      CHECK (end_at >= start_at);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "block_import_crating_requests"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  case_mode "ServiceCaseMode";
BEGIN
  SELECT mode INTO case_mode FROM "service_cases" WHERE id = NEW.case_id;
  IF case_mode = 'IMPORT' THEN
    RAISE EXCEPTION 'Crating is not allowed for IMPORT mode (case_id=%)', NEW.case_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_block_import_crating_requests" ON "crating_requests";
CREATE TRIGGER "trg_block_import_crating_requests"
BEFORE INSERT OR UPDATE ON "crating_requests"
FOR EACH ROW
EXECUTE FUNCTION "block_import_crating_requests"();
