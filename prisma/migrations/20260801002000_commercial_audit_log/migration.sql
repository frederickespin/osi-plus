-- DB-01D — CommercialAuditLog multiempresa.
-- Cadena experimental y local: baseline canónico -> MT-01A -> DB-01D.
-- Cambio aditivo. No importa el historial JSON heredado.

CREATE TABLE "osi"."commercial_audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "actor_membership_id" TEXT,
  "role_snapshot" VARCHAR(64) NOT NULL,
  "action" VARCHAR(160) NOT NULL,
  "entity" VARCHAR(120) NOT NULL,
  "entity_id" VARCHAR(191) NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "metadata_json" JSONB,
  "source" VARCHAR(80) NOT NULL,
  "request_id" VARCHAR(191),
  "correlation_id" VARCHAR(191) NOT NULL,
  "critical" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_audit_logs_actor_membership_requires_user_check"
    CHECK ("actor_membership_id" IS NULL OR "actor_user_id" IS NOT NULL),
  CONSTRAINT "commercial_audit_logs_identity_not_blank_check"
    CHECK (
      BTRIM("role_snapshot") <> '' AND
      BTRIM("action") <> '' AND
      BTRIM("entity") <> '' AND
      BTRIM("entity_id") <> '' AND
      BTRIM("source") <> '' AND
      BTRIM("correlation_id") <> ''
    )
);

-- Permite que una sola FK pruebe simultáneamente tenant, membresía y usuario.
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_id_user_id_key"
  ON "osi"."tenant_memberships"("tenant_id", "id", "user_id");

CREATE UNIQUE INDEX "commercial_audit_logs_tenant_request_event_key"
  ON "osi"."commercial_audit_logs"("tenant_id", "request_id", "action", "entity", "entity_id")
  WHERE "request_id" IS NOT NULL;

CREATE INDEX "commercial_audit_logs_tenant_created_at_id_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "created_at" DESC, "id" DESC);
CREATE INDEX "commercial_audit_logs_tenant_entity_created_at_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "entity", "entity_id", "created_at" DESC);
CREATE INDEX "commercial_audit_logs_tenant_actor_user_created_at_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "actor_user_id", "created_at" DESC);
CREATE INDEX "commercial_audit_logs_tenant_actor_membership_created_at_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "actor_membership_id", "created_at" DESC);
CREATE INDEX "commercial_audit_logs_tenant_action_created_at_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "action", "created_at" DESC);
CREATE INDEX "commercial_audit_logs_tenant_source_created_at_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "source", "created_at" DESC);
CREATE INDEX "commercial_audit_logs_tenant_correlation_id_idx"
  ON "osi"."commercial_audit_logs"("tenant_id", "correlation_id");

ALTER TABLE "osi"."commercial_audit_logs"
  ADD CONSTRAINT "commercial_audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "osi"."tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."commercial_audit_logs"
  ADD CONSTRAINT "commercial_audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "osi"."osi_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "osi"."commercial_audit_logs"
  ADD CONSTRAINT "commercial_audit_logs_actor_membership_tenant_user_fkey"
  FOREIGN KEY ("tenant_id", "actor_membership_id", "actor_user_id")
  REFERENCES "osi"."tenant_memberships"("tenant_id", "id", "user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- La API normal no puede actualizar ni eliminar auditorías. Una operación
-- administrativa extraordinaria requeriría retirar explícitamente el trigger.
CREATE FUNCTION "osi"."commercial_audit_logs_reject_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commercial_audit_logs is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "commercial_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "osi"."commercial_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "osi"."commercial_audit_logs_reject_mutation"();
