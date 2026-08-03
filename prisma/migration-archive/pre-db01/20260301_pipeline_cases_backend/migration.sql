-- Pipeline Cases backend (SalesPipelineBoard + CaseDetails)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineCaseStatus') THEN
    CREATE TYPE "PipelineCaseStatus" AS ENUM (
      'NEW_INBOX',
      'AWAITING_ICP',
      'GOVERNANCE_CONFIRMED',
      'REQUIREMENTS_CONFIRMED',
      'SURVEY_PLANNING',
      'SURVEY_SCHEDULED',
      'SURVEY_COMPLETED',
      'CRATING_ESTIMATE_PENDING',
      'PRICING_IN_PROGRESS',
      'INTERNAL_REVIEW',
      'QUOTE_SENT',
      'NEGOTIATION',
      'CHANGE_CONTROL',
      'APPROVED',
      'OPS_HANDOFF'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineMode') THEN
    CREATE TYPE "PipelineMode" AS ENUM ('LOCAL', 'EXPORT', 'IMPORT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineCustomerType') THEN
    CREATE TYPE "PipelineCustomerType" AS ENUM ('L1_AGENT', 'L2_INTL_DIRECT', 'L3_CORPORATE', 'L4_PERSONAL');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineSurveyMethod') THEN
    CREATE TYPE "PipelineSurveyMethod" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'LISTADO_FOTOS', 'NO_APLICA');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineQuoteLevel') THEN
    CREATE TYPE "PipelineQuoteLevel" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineEventType') THEN
    CREATE TYPE "PipelineEventType" AS ENUM ('SURVEY', 'FOLLOW_UP', 'DEADLINE', 'SERVICE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PipelineEventStatus') THEN
    CREATE TYPE "PipelineEventStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_pipeline_cases" (
  "id" TEXT NOT NULL,
  "caseCode" TEXT NOT NULL,
  "clientName" TEXT,
  "mode" "PipelineMode" NOT NULL,
  "serviceType" TEXT NOT NULL,
  "customerType" "PipelineCustomerType" NOT NULL,
  "status" "PipelineCaseStatus" NOT NULL DEFAULT 'NEW_INBOX',
  "ownerId" TEXT,
  "ownerName" TEXT NOT NULL,
  "estimatedCbm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "requiresSurvey" BOOLEAN NOT NULL DEFAULT false,
  "surveyMethod" "PipelineSurveyMethod" NOT NULL DEFAULT 'NO_APLICA',
  "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "milestonesJson" JSONB,
  "originLocation" TEXT NOT NULL,
  "destinationLocation" TEXT NOT NULL,
  "destinationContracted" BOOLEAN NOT NULL DEFAULT true,
  "destinationOverrideType" TEXT,
  "destinationAcceptanceUploaded" BOOLEAN NOT NULL DEFAULT false,
  "noDestinationCaseType" TEXT,
  "assetsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_pipeline_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_pipeline_cases_caseCode_key" ON "osi_pipeline_cases" ("caseCode");
CREATE INDEX IF NOT EXISTS "osi_pipeline_cases_mode_status_updatedAt_idx" ON "osi_pipeline_cases" ("mode", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "osi_pipeline_cases_ownerId_status_updatedAt_idx" ON "osi_pipeline_cases" ("ownerId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "osi_pipeline_cases_createdAt_idx" ON "osi_pipeline_cases" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_pipeline_cases_ownerId_fkey'
  ) THEN
    ALTER TABLE "osi_pipeline_cases"
      ADD CONSTRAINT "osi_pipeline_cases_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "osi_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_pipeline_events" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "eventType" "PipelineEventType" NOT NULL,
  "status" "PipelineEventStatus" NOT NULL DEFAULT 'PENDING',
  "startAt" TIMESTAMP(3) NOT NULL,
  "code" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_pipeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_pipeline_events_caseId_startAt_idx" ON "osi_pipeline_events" ("caseId", "startAt");
CREATE INDEX IF NOT EXISTS "osi_pipeline_events_eventType_startAt_idx" ON "osi_pipeline_events" ("eventType", "startAt");
CREATE INDEX IF NOT EXISTS "osi_pipeline_events_code_idx" ON "osi_pipeline_events" ("code");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_pipeline_events_caseId_fkey'
  ) THEN
    ALTER TABLE "osi_pipeline_events"
      ADD CONSTRAINT "osi_pipeline_events_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "osi_pipeline_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_pipeline_case_quotes" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "level" "PipelineQuoteLevel" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_pipeline_case_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "osi_pipeline_case_quotes_caseId_version_idx" ON "osi_pipeline_case_quotes" ("caseId", "version");
CREATE INDEX IF NOT EXISTS "osi_pipeline_case_quotes_status_updatedAt_idx" ON "osi_pipeline_case_quotes" ("status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_pipeline_case_quotes_caseId_fkey'
  ) THEN
    ALTER TABLE "osi_pipeline_case_quotes"
      ADD CONSTRAINT "osi_pipeline_case_quotes_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "osi_pipeline_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "osi_pipeline_crating_requests" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "code" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "estimateReady" BOOLEAN NOT NULL DEFAULT false,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osi_pipeline_crating_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "osi_pipeline_crating_requests_caseId_key" ON "osi_pipeline_crating_requests" ("caseId");
CREATE INDEX IF NOT EXISTS "osi_pipeline_crating_requests_status_updatedAt_idx" ON "osi_pipeline_crating_requests" ("status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'osi_pipeline_crating_requests_caseId_fkey'
  ) THEN
    ALTER TABLE "osi_pipeline_crating_requests"
      ADD CONSTRAINT "osi_pipeline_crating_requests_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "osi_pipeline_cases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

