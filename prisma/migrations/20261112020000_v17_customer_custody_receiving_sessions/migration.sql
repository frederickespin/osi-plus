ALTER TABLE "osi"."material_warehouses"
  ADD COLUMN "custody_unload_target_minutes" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "osi"."customer_storage_lots"
  ADD COLUMN "unloading_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "unloading_finished_at" TIMESTAMPTZ(6),
  ADD COLUMN "unload_target_minutes" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "vehicle_evidence" JSONB;

ALTER TABLE "osi"."material_warehouses"
  ADD CONSTRAINT "material_warehouses_custody_unload_target_minutes_check"
  CHECK ("custody_unload_target_minutes" BETWEEN 15 AND 1440);

ALTER TABLE "osi"."customer_storage_lots"
  ADD CONSTRAINT "customer_storage_lots_unload_target_minutes_check"
  CHECK ("unload_target_minutes" BETWEEN 15 AND 1440),
  ADD CONSTRAINT "customer_storage_lots_unloading_order_check"
  CHECK ("unloading_finished_at" IS NULL OR "unloading_started_at" IS NOT NULL AND "unloading_finished_at" >= "unloading_started_at");
