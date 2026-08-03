CREATE TABLE IF NOT EXISTS "quote_addendums" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "base_version" INTEGER NOT NULL,
    "addendum_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount_delta" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "quote_addendums_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_addendums"
    ADD COLUMN IF NOT EXISTS "base_approved_amount" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "cap_percent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS "financial_nature" TEXT NOT NULL DEFAULT 'CUSTOMER_REVENUE',
    ADD COLUMN IF NOT EXISTS "service_classification" TEXT NOT NULL DEFAULT 'SCOPE_ADDITION',
    ADD COLUMN IF NOT EXISTS "invoice_treatment" TEXT NOT NULL DEFAULT 'ADDITIONAL_LINE',
    ADD COLUMN IF NOT EXISTS "invoice_line_description" TEXT,
    ADD COLUMN IF NOT EXISTS "billing_status" TEXT NOT NULL DEFAULT 'PENDING_INVOICE',
    ADD COLUMN IF NOT EXISTS "invoice_reference" TEXT,
    ADD COLUMN IF NOT EXISTS "acceptance_json" JSONB,
    ADD COLUMN IF NOT EXISTS "evidence_json" JSONB,
    ADD COLUMN IF NOT EXISTS "operational_adjustment_json" JSONB,
    ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);

ALTER TABLE "quote_addendums"
    ADD CONSTRAINT "quote_addendums_amount_delta_positive"
    CHECK ("amount_delta" > 0) NOT VALID;

CREATE INDEX IF NOT EXISTS "quote_addendums_quote_status_idx"
    ON "quote_addendums"("quote_id", "status");
