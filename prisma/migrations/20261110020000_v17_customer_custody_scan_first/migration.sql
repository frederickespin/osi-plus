-- Scan-first reception treats every physical package as one uniquely labelled
-- custody unit. Location capacity is confirmed visually by the warehouse team;
-- measurements remain advisory and never determine whether a space is full.
CREATE TYPE "CustomerCustodyUnitType" AS ENUM (
  'BOX', 'PACKAGE', 'BUNDLE', 'PALLET', 'LOOSE_ITEM', 'CRATE', 'OTHER'
);

CREATE TYPE "CustomerCustodyIdentitySource" AS ENUM (
  'MANIFEST', 'GENERATED_AT_RECEPTION'
);

CREATE TYPE "CustomerCustodyInspectionStatus" AS ENUM (
  'PREVERIFIED', 'VISUAL_REQUIRED', 'FULL_REQUIRED', 'CLEARED', 'HOLD'
);

CREATE TYPE "CustomerCustodyLocationOccupancyStatus" AS ENUM (
  'AVAILABLE', 'IN_USE', 'FULL', 'BLOCKED', 'RESERVED_EXIT', 'REVIEW_REQUIRED'
);

ALTER TABLE "customer_stored_items"
  ADD COLUMN "unit_type" "CustomerCustodyUnitType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "generic_contents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "identity_source" "CustomerCustodyIdentitySource" NOT NULL DEFAULT 'MANIFEST',
  ADD COLUMN "inspection_status" "CustomerCustodyInspectionStatus" NOT NULL DEFAULT 'CLEARED';

CREATE TABLE "customer_custody_location_states" (
  "id" TEXT NOT NULL,
  "state_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "warehouse_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "status" "CustomerCustodyLocationOccupancyStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" VARCHAR(1000),
  "evidence" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_custody_location_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_custody_location_states_evidence_check"
    CHECK ("evidence" IS NULL OR jsonb_typeof("evidence") = 'array')
);

CREATE TABLE "customer_custody_location_state_events" (
  "id" TEXT NOT NULL,
  "event_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "location_state_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "command_id" UUID NOT NULL,
  "previous_status" "CustomerCustodyLocationOccupancyStatus",
  "next_status" "CustomerCustodyLocationOccupancyStatus" NOT NULL,
  "notes" VARCHAR(1000),
  "evidence" JSONB,
  "actor_membership_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_custody_location_state_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_custody_location_state_events_evidence_check"
    CHECK ("evidence" IS NULL OR jsonb_typeof("evidence") = 'array')
);

CREATE UNIQUE INDEX "customer_custody_location_states_tenant_id_key"
  ON "customer_custody_location_states"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_custody_location_states_tenant_ref_key"
  ON "customer_custody_location_states"("tenant_id", "state_ref");
CREATE UNIQUE INDEX "customer_custody_location_states_location_key"
  ON "customer_custody_location_states"("tenant_id", "warehouse_id", "location_id");
CREATE INDEX "customer_custody_location_states_status_idx"
  ON "customer_custody_location_states"("tenant_id", "warehouse_id", "status");
CREATE UNIQUE INDEX "customer_custody_location_state_events_tenant_id_key"
  ON "customer_custody_location_state_events"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_custody_location_state_events_tenant_ref_key"
  ON "customer_custody_location_state_events"("tenant_id", "event_ref");
CREATE INDEX "customer_custody_location_state_events_location_idx"
  ON "customer_custody_location_state_events"("tenant_id", "location_id", "occurred_at" DESC);

ALTER TABLE "customer_custody_location_states"
  ADD CONSTRAINT "customer_custody_location_states_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_states_warehouse_fkey"
    FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "material_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_states_location_fkey"
    FOREIGN KEY ("tenant_id", "warehouse_id", "location_id") REFERENCES "material_locations"("tenant_id", "warehouse_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_custody_location_state_events"
  ADD CONSTRAINT "customer_custody_location_state_events_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_state_events_state_fkey"
    FOREIGN KEY ("tenant_id", "location_state_id") REFERENCES "customer_custody_location_states"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_state_events_location_fkey"
    FOREIGN KEY ("tenant_id", "location_id") REFERENCES "material_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_state_events_command_fkey"
    FOREIGN KEY ("tenant_id", "command_id") REFERENCES "customer_custody_commands"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_custody_location_state_events_actor_fkey"
    FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id") REFERENCES "tenant_memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "v17_customer_custody_location_state_event_append_only_guard"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CUSTOMER_CUSTODY_LOCATION_STATE_EVENT_APPEND_ONLY';
END;
$$;

CREATE TRIGGER "customer_custody_location_state_events_append_only"
BEFORE UPDATE OR DELETE ON "customer_custody_location_state_events"
FOR EACH ROW EXECUTE FUNCTION "v17_customer_custody_location_state_event_append_only_guard"();

