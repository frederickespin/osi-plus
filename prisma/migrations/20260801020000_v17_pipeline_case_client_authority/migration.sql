-- V17-CASE-CLIENT-01 — autoridad nullable del Client receptor del servicio.
-- Cambio aditivo de datos: no asigna Client ni modifica estado, owner, versión o journal.

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD COLUMN "client_id" TEXT;

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_client_requires_tenant_check"
    CHECK ("client_id" IS NULL OR "tenant_id" IS NOT NULL);

CREATE UNIQUE INDEX "osi_pipeline_cases_tenant_id_id_client_id_key"
  ON "osi"."osi_pipeline_cases"("tenant_id", "id", "client_id");

CREATE INDEX "osi_pipeline_cases_tenant_id_client_id_status_updated_at_idx"
  ON "osi"."osi_pipeline_cases"("tenant_id", "client_id", "status", "updatedAt");

ALTER TABLE "osi"."osi_pipeline_cases"
  ADD CONSTRAINT "osi_pipeline_cases_tenant_id_client_id_fkey"
    FOREIGN KEY ("tenant_id", "client_id")
    REFERENCES "osi"."osi_clients"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "osi"."osi_projects"
  DROP CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_fkey";

DROP INDEX "osi"."osi_projects_tenant_id_pipeline_case_id_idx";

ALTER TABLE "osi"."osi_projects"
  ADD CONSTRAINT "osi_projects_tenant_id_pipeline_case_id_client_id_fkey"
    FOREIGN KEY ("tenant_id", "pipeline_case_id", "clientId")
    REFERENCES "osi"."osi_pipeline_cases"("tenant_id", "id", "client_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "osi_projects_tenant_id_pipeline_case_id_client_id_idx"
  ON "osi"."osi_projects"("tenant_id", "pipeline_case_id", "clientId");
