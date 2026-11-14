CREATE TYPE "osi"."CustomerStorageExitReason" AS ENUM ('NORMAL', 'OVERFLOW_RETURN');
CREATE TYPE "osi"."CustomerStoragePaymentClearance" AS ENUM ('NOT_APPLICABLE', 'CURRENT', 'OVERRIDE_APPROVED');
CREATE TYPE "osi"."CustomerCustodyExcessStatus" AS ENUM ('PENDING_COMMERCIAL', 'AUTHORIZED', 'RELEASED', 'CANCELLED');
CREATE TYPE "osi"."CustomerCustodyExcessReason" AS ENUM ('CONTRACTED_CAPACITY_FULL', 'UNDECLARED_ADDITIONAL_ITEMS', 'CUSTOMER_DECLINED_EXPANSION', 'COMPANY_ESTIMATION_ERROR', 'WAREHOUSE_CAPACITY_FAILURE', 'OTHER_AUTHORIZED');

ALTER TYPE "osi"."CustomerCustodyMovementType" ADD VALUE 'STAGE_EXCESS';

ALTER TABLE "osi"."material_warehouses"
  ADD COLUMN "custody_excess_grace_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "custody_excess_daily_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "custody_excess_currency" CHAR(3) NOT NULL DEFAULT 'DOP';

ALTER TABLE "osi"."customer_storage_authorizations"
  ADD COLUMN "exit_reason" "osi"."CustomerStorageExitReason",
  ADD COLUMN "payment_clearance" "osi"."CustomerStoragePaymentClearance" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "payment_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "payment_reference" VARCHAR(191);

ALTER TABLE "osi"."customer_stored_items"
  ADD COLUMN "excess_status" "osi"."CustomerCustodyExcessStatus",
  ADD COLUMN "excess_reason" "osi"."CustomerCustodyExcessReason",
  ADD COLUMN "excess_grace_until" TIMESTAMPTZ(6),
  ADD COLUMN "excess_daily_rate" DECIMAL(12,2),
  ADD COLUMN "excess_currency" CHAR(3),
  ADD COLUMN "excess_released_at" TIMESTAMPTZ(6),
  ADD COLUMN "excess_final_charge" DECIMAL(12,2);

ALTER TABLE "osi"."material_warehouses"
  ADD CONSTRAINT "material_warehouses_custody_excess_grace_hours_check"
  CHECK ("custody_excess_grace_hours" BETWEEN 0 AND 720),
  ADD CONSTRAINT "material_warehouses_custody_excess_daily_rate_check"
  CHECK ("custody_excess_daily_rate" >= 0),
  ADD CONSTRAINT "material_warehouses_custody_excess_currency_check"
  CHECK ("custody_excess_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "osi"."customer_storage_authorizations"
  ADD CONSTRAINT "customer_storage_authorizations_exit_governance_check"
  CHECK (
    ("movement_type" = 'ENTRY' AND "exit_reason" IS NULL AND "payment_clearance" = 'NOT_APPLICABLE' AND "payment_verified_at" IS NULL)
    OR
    ("movement_type" = 'EXIT' AND "exit_reason" = 'OVERFLOW_RETURN' AND "payment_clearance" = 'NOT_APPLICABLE' AND "payment_verified_at" IS NULL)
    OR
    ("movement_type" = 'EXIT' AND "exit_reason" = 'NORMAL' AND "payment_clearance" IN ('CURRENT', 'OVERRIDE_APPROVED') AND "payment_verified_at" IS NOT NULL)
  );

ALTER TABLE "osi"."customer_stored_items"
  ADD CONSTRAINT "customer_stored_items_excess_fields_check"
  CHECK (
    ("excess_status" IS NULL AND "excess_reason" IS NULL AND "excess_grace_until" IS NULL AND "excess_daily_rate" IS NULL AND "excess_currency" IS NULL AND "excess_released_at" IS NULL AND "excess_final_charge" IS NULL)
    OR
    ("excess_status" IS NOT NULL AND "excess_reason" IS NOT NULL AND "excess_grace_until" IS NOT NULL AND "excess_daily_rate" IS NOT NULL AND "excess_daily_rate" >= 0 AND "excess_currency" ~ '^[A-Z]{3}$')
  );

CREATE INDEX "customer_stored_items_excess_status_idx"
  ON "osi"."customer_stored_items" ("tenant_id", "excess_status", "excess_grace_until");

CREATE INDEX "customer_storage_authorizations_exit_reason_idx"
  ON "osi"."customer_storage_authorizations" ("tenant_id", "exit_reason", "status", "valid_until");
