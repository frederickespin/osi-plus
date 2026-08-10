-- MT-01C2B1 — Fundación multiempresa nullable de raíces comerciales.
-- Cambio estrictamente aditivo e inactivo: no asigna tenants ni activa consumidores.

ALTER TABLE "osi"."osi_clients"
  ADD COLUMN "tenant_id" TEXT;

ALTER TABLE "osi"."osi_projects"
  ADD COLUMN "tenant_id" TEXT;

ALTER TABLE "osi"."osi_leads"
  ADD COLUMN "tenant_id" TEXT;

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD COLUMN "tenant_id" TEXT,
  ADD COLUMN "owner_membership_id" TEXT,
  ADD COLUMN "owner_user_id" TEXT;

CREATE UNIQUE INDEX "osi_clients_tenant_id_id_key"
  ON "osi"."osi_clients"("tenant_id", "id");
CREATE INDEX "osi_clients_tenant_id_status_idx"
  ON "osi"."osi_clients"("tenant_id", "status");

CREATE UNIQUE INDEX "osi_projects_tenant_id_id_key"
  ON "osi"."osi_projects"("tenant_id", "id");
CREATE INDEX "osi_projects_tenant_id_status_idx"
  ON "osi"."osi_projects"("tenant_id", "status");
CREATE INDEX "osi_projects_tenant_id_client_id_idx"
  ON "osi"."osi_projects"("tenant_id", "clientId");

CREATE UNIQUE INDEX "osi_leads_tenant_id_id_key"
  ON "osi"."osi_leads"("tenant_id", "id");
CREATE INDEX "osi_leads_tenant_id_status_updated_at_idx"
  ON "osi"."osi_leads"("tenant_id", "status", "updatedAt");
CREATE INDEX "osi_leads_tenant_id_customer_id_idx"
  ON "osi"."osi_leads"("tenant_id", "customerId");
CREATE INDEX "osi_leads_tenant_id_project_id_idx"
  ON "osi"."osi_leads"("tenant_id", "projectId");

CREATE UNIQUE INDEX "osi_pipeline_cases_tenant_id_id_key"
  ON "osi"."osi_pipeline_cases"("tenant_id", "id");
CREATE INDEX "osi_pipeline_cases_tenant_id_status_updated_at_idx"
  ON "osi"."osi_pipeline_cases"("tenant_id", "status", "updatedAt");
CREATE INDEX "osi_pipeline_cases_tenant_owner_idx"
  ON "osi"."osi_pipeline_cases"("tenant_id", "owner_membership_id", "owner_user_id");

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_enterprise_owner_complete_check" CHECK (
    ("owner_membership_id" IS NULL AND "owner_user_id" IS NULL)
    OR
    ("tenant_id" IS NOT NULL AND "owner_membership_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)
  );

ALTER TABLE "osi"."osi_clients"
  ADD CONSTRAINT "osi_clients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."osi_projects"
  ADD CONSTRAINT "osi_projects_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "osi_projects_tenant_id_client_id_fkey"
  FOREIGN KEY ("tenant_id", "clientId") REFERENCES "osi"."osi_clients"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."osi_leads"
  ADD CONSTRAINT "osi_leads_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "osi_leads_tenant_id_customer_id_fkey"
  FOREIGN KEY ("tenant_id", "customerId") REFERENCES "osi"."osi_clients"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "osi_leads_tenant_id_project_id_fkey"
  FOREIGN KEY ("tenant_id", "projectId") REFERENCES "osi"."osi_projects"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "osi_pipeline_cases_enterprise_owner_fkey"
  FOREIGN KEY ("tenant_id", "owner_membership_id", "owner_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- La FK heredada Project.client usa CASCADE. PostgreSQL puede ejecutar ese
-- cascade antes de evaluar la FK empresarial RESTRICT, por lo que esta guarda
-- preserva únicamente las relaciones tenantizadas sin cambiar filas legacy.
CREATE FUNCTION "osi"."mt01c2b1_restrict_tenant_client_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."tenant_id" IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "osi"."osi_projects" p
    WHERE p."tenant_id" = OLD."tenant_id"
      AND p."clientId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'MT01C2B1_TENANT_CLIENT_REFERENCED'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "osi_clients_tenant_project_restrict_trigger"
BEFORE DELETE ON "osi"."osi_clients"
FOR EACH ROW
EXECUTE FUNCTION "osi"."mt01c2b1_restrict_tenant_client_delete"();
