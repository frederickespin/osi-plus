-- V17 migration 20: public tenant-first identity for administrative Membership APIs.
-- The only backfill is the technical UUID identity required by the new NOT NULL column.

ALTER TABLE "osi"."tenant_memberships" ADD COLUMN "public_ref" UUID;

UPDATE "osi"."tenant_memberships"
SET "public_ref" = gen_random_uuid()
WHERE "public_ref" IS NULL;

ALTER TABLE "osi"."tenant_memberships"
  ALTER COLUMN "public_ref" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "public_ref" SET NOT NULL;

ALTER TABLE "osi"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_public_ref_key"
  UNIQUE ("tenant_id", "public_ref");

CREATE FUNCTION "osi"."tenant_memberships_reject_public_ref_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, osi
AS $$
BEGIN
  IF NEW."public_ref" IS DISTINCT FROM OLD."public_ref" THEN
    RAISE EXCEPTION 'TenantMembership.publicRef is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tenant_memberships_public_ref_immutable"
BEFORE UPDATE OF "public_ref" ON "osi"."tenant_memberships"
FOR EACH ROW EXECUTE FUNCTION "osi"."tenant_memberships_reject_public_ref_mutation"();
