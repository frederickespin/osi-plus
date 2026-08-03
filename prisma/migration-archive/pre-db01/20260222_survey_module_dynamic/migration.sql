-- Dynamic Survey Module (Lead -> Survey -> Gateway/K)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyType') THEN
    CREATE TYPE "SurveyType" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'LISTADO');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyStatus') THEN
    CREATE TYPE "SurveyStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyPropertyType') THEN
    CREATE TYPE "SurveyPropertyType" AS ENUM ('CASA', 'APARTAMENTO', 'OFICINA', 'NAVE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyStairsType') THEN
    CREATE TYPE "SurveyStairsType" AS ENUM ('CARACOL', 'RECTAS', 'MIXTO');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyPackLevel') THEN
    CREATE TYPE "SurveyPackLevel" AS ENUM ('P1', 'P2', 'P3');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyDimensionUnit') THEN
    CREATE TYPE "SurveyDimensionUnit" AS ENUM ('CM', 'IN');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyMediaType') THEN
    CREATE TYPE "SurveyMediaType" AS ENUM ('SITE', 'PRE_EXISTING_DAMAGE', 'NESTING_ITEM', 'OTHER');
  END IF;
END
$$;

ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "surveyRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "surveyStatus" "SurveyStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "surveyCompletedAt" TIMESTAMP(3);
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "surveyFlagsJson" JSONB;
ALTER TABLE "osi_leads" ADD COLUMN IF NOT EXISTS "surveySummaryJson" JSONB;

CREATE TABLE IF NOT EXISTS "osi_surveys" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "clientId" TEXT,
  "projectId" TEXT,
  "type" "SurveyType" NOT NULL DEFAULT 'PRESENCIAL',
  "status" "SurveyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "inspectorUserId" TEXT,
  "originAddressId" TEXT,
  "checkInGps" JSONB,
  "checkInAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "estimatedTotalVolume" DOUBLE PRECISION,
  "volumeUnit" TEXT,
  "prohibitedItemsAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "riskNotes" TEXT,
  "longCarry" BOOLEAN NOT NULL DEFAULT false,
  "stairCarryRisk" BOOLEAN NOT NULL DEFAULT false,
  "needsPermits" BOOLEAN NOT NULL DEFAULT false,
  "needsCratingCount" INTEGER NOT NULL DEFAULT 0,
  "packP1Count" INTEGER NOT NULL DEFAULT 0,
  "packP2Count" INTEGER NOT NULL DEFAULT 0,
  "packP3Count" INTEGER NOT NULL DEFAULT 0,
  "flagsJson" JSONB,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_surveys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_surveys_leadId_createdAt_idx" ON "osi_surveys" ("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "osi_surveys_status_updatedAt_idx" ON "osi_surveys" ("status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_surveys_leadId_fkey'
  ) THEN
    ALTER TABLE "osi_surveys"
      ADD CONSTRAINT "osi_surveys_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "osi_leads"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_surveys_clientId_fkey'
  ) THEN
    ALTER TABLE "osi_surveys"
      ADD CONSTRAINT "osi_surveys_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "osi_clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_surveys_projectId_fkey'
  ) THEN
    ALTER TABLE "osi_surveys"
      ADD CONSTRAINT "osi_surveys_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "osi_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_site_access" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "propertyType" "SurveyPropertyType",
  "floorLevel" INTEGER,
  "elevatorAvailableForMove" BOOLEAN,
  "elevatorDims" JSONB,
  "stairsType" "SurveyStairsType",
  "stairsWidthOk" BOOLEAN,
  "truckParkingDistanceM" DOUBLE PRECISION,
  "timeRestrictionsForTrucks" BOOLEAN,
  "timeRestrictionsNote" TEXT,
  "permitsRequired" TEXT[],
  "permitsEvidenceProvided" BOOLEAN NOT NULL DEFAULT false,
  "permitsTaskCreated" BOOLEAN NOT NULL DEFAULT false,
  "longCarry" BOOLEAN NOT NULL DEFAULT false,
  "stairCarryRisk" BOOLEAN NOT NULL DEFAULT false,
  "needsPermits" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_site_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_survey_site_access_surveyId_key" ON "osi_survey_site_access" ("surveyId");
CREATE INDEX IF NOT EXISTS "osi_survey_site_access_surveyId_longCarry_stairCarryRisk_idx"
  ON "osi_survey_site_access" ("surveyId", "longCarry", "stairCarryRisk");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_site_access_surveyId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_site_access"
      ADD CONSTRAINT "osi_survey_site_access_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "osi_surveys"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_rooms" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_rooms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_survey_rooms_surveyId_sortOrder_idx" ON "osi_survey_rooms" ("surveyId", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_rooms_surveyId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_rooms"
      ADD CONSTRAINT "osi_survey_rooms_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "osi_surveys"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_items" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "roomId" TEXT,
  "itemRef" TEXT,
  "itemName" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "packLevel" "SurveyPackLevel" NOT NULL DEFAULT 'P1',
  "needsDisassembly" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "unitVolume" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_survey_items_surveyId_packLevel_idx" ON "osi_survey_items" ("surveyId", "packLevel");
CREATE INDEX IF NOT EXISTS "osi_survey_items_roomId_idx" ON "osi_survey_items" ("roomId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_items_surveyId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_items"
      ADD CONSTRAINT "osi_survey_items_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "osi_surveys"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_items_roomId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_items"
      ADD CONSTRAINT "osi_survey_items_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "osi_survey_rooms"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_item_nesting" (
  "id" TEXT NOT NULL,
  "surveyItemId" TEXT NOT NULL,
  "realLength" DOUBLE PRECISION,
  "realWidth" DOUBLE PRECISION,
  "realHeight" DOUBLE PRECISION,
  "unit" "SurveyDimensionUnit" NOT NULL DEFAULT 'CM',
  "technicalNote" TEXT,
  "ispm15Required" BOOLEAN NOT NULL DEFAULT false,
  "fragileTier" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_item_nesting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_survey_item_nesting_surveyItemId_key" ON "osi_survey_item_nesting" ("surveyItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_item_nesting_surveyItemId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_item_nesting"
      ADD CONSTRAINT "osi_survey_item_nesting_surveyItemId_fkey"
      FOREIGN KEY ("surveyItemId") REFERENCES "osi_survey_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_media" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "surveyItemId" TEXT,
  "type" "SurveyMediaType" NOT NULL DEFAULT 'OTHER',
  "url" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_survey_media_surveyId_type_idx" ON "osi_survey_media" ("surveyId", "type");
CREATE INDEX IF NOT EXISTS "osi_survey_media_surveyItemId_type_idx" ON "osi_survey_media" ("surveyItemId", "type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_media_surveyId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_media"
      ADD CONSTRAINT "osi_survey_media_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "osi_surveys"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_media_surveyItemId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_media"
      ADD CONSTRAINT "osi_survey_media_surveyItemId_fkey"
      FOREIGN KEY ("surveyItemId") REFERENCES "osi_survey_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_survey_signatures" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "signerName" TEXT,
  "acceptedDigital" BOOLEAN NOT NULL DEFAULT false,
  "signatureDataUrl" TEXT,
  "signatureNote" TEXT,
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "osi_survey_signatures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_survey_signatures_surveyId_key" ON "osi_survey_signatures" ("surveyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'osi_survey_signatures_surveyId_fkey'
  ) THEN
    ALTER TABLE "osi_survey_signatures"
      ADD CONSTRAINT "osi_survey_signatures_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "osi_surveys"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
