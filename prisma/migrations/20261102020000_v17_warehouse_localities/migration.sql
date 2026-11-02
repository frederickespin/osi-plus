-- V17 20E: an explicitly assigned locality on the warehouse profile.
-- Existing warehouses remain unassigned; immutable inventory codes and address labels are unchanged.
ALTER TABLE "warehouse_sheet_profiles" ADD COLUMN "locality_number" INTEGER;
ALTER TABLE "warehouse_sheet_profiles" ADD CONSTRAINT "warehouse_sheet_profiles_locality_number_check" CHECK (
  "locality_number" IS NULL OR "locality_number" BETWEEN 1 AND 999
);
