BEGIN;

ALTER TABLE "osi_vehicles"
  ADD COLUMN "transit_configuration" VARCHAR(24),
  ADD COLUMN "transit_axles" INTEGER,
  ADD COLUMN "toll_category" INTEGER,
  ADD CONSTRAINT "osi_vehicles_transit_configuration_check"
    CHECK ("transit_configuration" IN ('RIGID', 'TRACTOR_SEMITRAILER', 'DOUBLE_TRAILER')),
  ADD CONSTRAINT "osi_vehicles_transit_axles_check" CHECK ("transit_axles" BETWEEN 2 AND 32),
  ADD CONSTRAINT "osi_vehicles_toll_category_check" CHECK ("toll_category" BETWEEN 1 AND 5);

COMMIT;
