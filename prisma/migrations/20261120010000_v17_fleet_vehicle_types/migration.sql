BEGIN;

CREATE TABLE "fleet_vehicle_types" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "normalized_name" VARCHAR(80) NOT NULL,
  "variable_volume" BOOLEAN NOT NULL DEFAULT false,
  "request_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fleet_vehicle_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fleet_vehicle_types_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fleet_vehicle_types_tenant_name_key" ON "fleet_vehicle_types"("tenant_id", "normalized_name");
CREATE UNIQUE INDEX "fleet_vehicle_types_tenant_request_key" ON "fleet_vehicle_types"("tenant_id", "request_id");

COMMIT;
