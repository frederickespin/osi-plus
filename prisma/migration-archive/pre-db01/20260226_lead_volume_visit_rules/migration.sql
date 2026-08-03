-- Lead derived mode + estimacion por areas + reglas de visita

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadDerivedMode') THEN
    CREATE TYPE "LeadDerivedMode" AS ENUM ('NATIONAL', 'IMPORT_EXPORT', 'PENDING');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadModePolicy') THEN
    CREATE TYPE "LeadModePolicy" AS ENUM ('FIXED', 'BY_DESTINATION');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceMode') THEN
    CREATE TYPE "ServiceMode" AS ENUM ('NATIONAL', 'IMPORT_EXPORT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyRule') THEN
    CREATE TYPE "SurveyRule" AS ENUM ('ALWAYS', 'THRESHOLD', 'OPTIONAL');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadEstimateConfidence') THEN
    CREATE TYPE "LeadEstimateConfidence" AS ENUM ('LOW', 'MED', 'HIGH');
  END IF;
END
$$;

ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "originCountryCode" TEXT;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "destinationCountryCode" TEXT;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "derivedMode" "LeadDerivedMode" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "modeUpdatedAt" TIMESTAMP(3);
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "visitSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "visitSkipReason" TEXT;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "visitSkipAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "osi_leads_derivedMode_modeUpdatedAt_idx" ON "osi_leads" ("derivedMode", "modeUpdatedAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'QuoteV2'
  ) THEN
    ALTER TABLE "QuoteV2" ADD COLUMN IF NOT EXISTS "modeSnapshot" "LeadDerivedMode" NOT NULL DEFAULT 'PENDING';
    CREATE INDEX IF NOT EXISTS "QuoteV2_modeSnapshot_status_idx" ON "QuoteV2" ("modeSnapshot", "status");
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_volume_area_profiles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultM3" DOUBLE PRECISION NOT NULL,
  "minM3" DOUBLE PRECISION NOT NULL,
  "maxM3" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  CONSTRAINT "osi_volume_area_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_volume_area_profiles_name_key" ON "osi_volume_area_profiles" ("name");
CREATE INDEX IF NOT EXISTS "osi_volume_area_profiles_active_updatedAt_idx" ON "osi_volume_area_profiles" ("active", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_volume_area_profiles_updatedById_fkey'
  ) THEN
    ALTER TABLE "osi_volume_area_profiles"
      ADD CONSTRAINT "osi_volume_area_profiles_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "osi_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_lead_volume_estimates" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "areaProfileId" TEXT NOT NULL,
  "estimatedM3Base" DOUBLE PRECISION NOT NULL,
  "adjustmentPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedM3Final" DOUBLE PRECISION NOT NULL,
  "confidence" "LeadEstimateConfidence" NOT NULL DEFAULT 'MED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  CONSTRAINT "osi_lead_volume_estimates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_lead_volume_estimates_leadId_key" ON "osi_lead_volume_estimates" ("leadId");
CREATE INDEX IF NOT EXISTS "osi_lead_volume_estimates_areaProfileId_updatedAt_idx" ON "osi_lead_volume_estimates" ("areaProfileId", "updatedAt");
CREATE INDEX IF NOT EXISTS "osi_lead_volume_estimates_confidence_updatedAt_idx" ON "osi_lead_volume_estimates" ("confidence", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_lead_volume_estimates_leadId_fkey'
  ) THEN
    ALTER TABLE "osi_lead_volume_estimates"
      ADD CONSTRAINT "osi_lead_volume_estimates_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "osi_leads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_lead_volume_estimates_areaProfileId_fkey'
  ) THEN
    ALTER TABLE "osi_lead_volume_estimates"
      ADD CONSTRAINT "osi_lead_volume_estimates_areaProfileId_fkey"
      FOREIGN KEY ("areaProfileId") REFERENCES "osi_volume_area_profiles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_lead_volume_estimates_updatedById_fkey'
  ) THEN
    ALTER TABLE "osi_lead_volume_estimates"
      ADD CONSTRAINT "osi_lead_volume_estimates_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "osi_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_tipos_servicio_config" (
  "id" TEXT NOT NULL,
  "serviceKey" TEXT NOT NULL,
  "modePolicy" "LeadModePolicy" NOT NULL DEFAULT 'FIXED',
  "fixedMode" "ServiceMode",
  "surveyRule" "SurveyRule" NOT NULL DEFAULT 'OPTIONAL',
  "surveyThresholdM3" DOUBLE PRECISION,
  "enableModules" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  CONSTRAINT "osi_tipos_servicio_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_tipos_servicio_config_serviceKey_key" ON "osi_tipos_servicio_config" ("serviceKey");
CREATE INDEX IF NOT EXISTS "osi_tipos_servicio_config_active_serviceKey_idx" ON "osi_tipos_servicio_config" ("active", "serviceKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_tipos_servicio_config_updatedById_fkey'
  ) THEN
    ALTER TABLE "osi_tipos_servicio_config"
      ADD CONSTRAINT "osi_tipos_servicio_config_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "osi_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

INSERT INTO "osi_volume_area_profiles" ("id", "name", "defaultM3", "minM3", "maxM3", "active")
VALUES
  ('vap_apto_1', 'Apartamento 1-2 hab', 24, 16, 35, true),
  ('vap_casa_3', 'Casa 3 habitaciones', 42, 28, 65, true),
  ('vap_oficina', 'Oficina corporativa', 55, 35, 120, true),
  ('vap_industrial', 'Industrial ligero', 90, 50, 220, true)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "osi_tipos_servicio_config"
("id", "serviceKey", "modePolicy", "fixedMode", "surveyRule", "surveyThresholdM3", "enableModules", "active")
VALUES
  ('tsc_corp_office', 'CORPORATE_OFFICE', 'BY_DESTINATION', NULL, 'THRESHOLD', 25, '{"customs": true}', true),
  ('tsc_corp_employee', 'CORPORATE_EMPLOYEE', 'BY_DESTINATION', NULL, 'THRESHOLD', 20, '{"customs": true}', true),
  ('tsc_industrial_reloc', 'INDUSTRIAL_RELOC', 'BY_DESTINATION', NULL, 'THRESHOLD', 30, '{"customs": true}', true),
  ('tsc_res_int', 'RESIDENTIAL_INTERNATIONAL', 'FIXED', 'IMPORT_EXPORT', 'ALWAYS', NULL, '{"customs": true}', true),
  ('tsc_default_local', 'DEFAULT_LOCAL', 'FIXED', 'NATIONAL', 'OPTIONAL', NULL, '{"customs": false}', true)
ON CONFLICT ("serviceKey") DO NOTHING;
