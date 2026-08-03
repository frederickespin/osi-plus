CREATE TABLE "evaluator_visit_reports" (
    "id" TEXT NOT NULL,
    "external_visit_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "case_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "piece_count" INTEGER NOT NULL DEFAULT 0,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluator_visit_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluator_visit_reports_external_visit_id_key"
    ON "evaluator_visit_reports"("external_visit_id");

CREATE INDEX "evaluator_visit_reports_case_id_confirmed_at_idx"
    ON "evaluator_visit_reports"("case_id", "confirmed_at");

CREATE INDEX "evaluator_visit_reports_status_confirmed_at_idx"
    ON "evaluator_visit_reports"("status", "confirmed_at");
