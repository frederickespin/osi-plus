ALTER TABLE "customer_stored_items"
  ADD COLUMN "package_form_code" VARCHAR(64),
  ADD COLUMN "package_form_label" VARCHAR(120);

CREATE TABLE "customer_custody_catalog_items" (
    "id" TEXT NOT NULL,
    "catalog_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "base_value" VARCHAR(80),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_custody_catalog_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_custody_catalog_items_kind_check" CHECK ("kind" IN ('DAMAGE_LOCATION', 'CONDITION', 'ITEM_NAME', 'PACKAGE_FORM')),
    CONSTRAINT "customer_custody_catalog_items_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "customer_custody_catalog_items_base_value_check" CHECK ("base_value" IS NULL OR "base_value" IN ('BOX', 'PACKAGE', 'BUNDLE', 'PALLET', 'LOOSE_ITEM', 'CRATE', 'OTHER')),
    CONSTRAINT "customer_custody_catalog_items_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_custody_catalog_items_tenant_id_id_key" ON "customer_custody_catalog_items"("tenant_id", "id");
CREATE UNIQUE INDEX "customer_custody_catalog_items_tenant_ref_key" ON "customer_custody_catalog_items"("tenant_id", "catalog_ref");
CREATE UNIQUE INDEX "customer_custody_catalog_items_kind_code_key" ON "customer_custody_catalog_items"("tenant_id", "kind", "code");
CREATE INDEX "customer_custody_catalog_items_lookup_idx" ON "customer_custody_catalog_items"("tenant_id", "kind", "status", "sort_order");

INSERT INTO "customer_custody_catalog_items" ("id", "tenant_id", "kind", "code", "label", "base_value", "sort_order")
SELECT CONCAT('custcat_', MD5(t."id" || ':' || seed."kind" || ':' || seed."code")), t."id", seed."kind", seed."code", seed."label", seed."base_value", seed."sort_order"
FROM "tenants" t
CROSS JOIN (VALUES
  ('DAMAGE_LOCATION', 'GENERAL', 'General', NULL, 10),
  ('DAMAGE_LOCATION', 'TOP', 'Tope', NULL, 20),
  ('DAMAGE_LOCATION', 'BOTTOM', 'Base', NULL, 30),
  ('DAMAGE_LOCATION', 'FRONT', 'Frente', NULL, 40),
  ('DAMAGE_LOCATION', 'BACK', 'Atrás', NULL, 50),
  ('DAMAGE_LOCATION', 'LEFT', 'Lado izquierdo', NULL, 60),
  ('DAMAGE_LOCATION', 'RIGHT', 'Lado derecho', NULL, 70),
  ('DAMAGE_LOCATION', 'LEGS', 'Patas', NULL, 80),
  ('DAMAGE_LOCATION', 'WHEELS', 'Ruedas', NULL, 90),
  ('CONDITION', 'NO_VISIBLE_DAMAGE', 'Sin daño visible', NULL, 10),
  ('CONDITION', 'SCRATCHED', 'Rayado', NULL, 20),
  ('CONDITION', 'BROKEN', 'Roto', NULL, 30),
  ('CONDITION', 'DIRTY', 'Sucio', NULL, 40),
  ('CONDITION', 'MOLDY', 'Enmohecido', NULL, 50),
  ('CONDITION', 'DENTED', 'Abollado', NULL, 60),
  ('CONDITION', 'WET', 'Mojado', NULL, 70),
  ('CONDITION', 'OPEN', 'Abierto', NULL, 80),
  ('CONDITION', 'CRUSHED', 'Aplastado', NULL, 90),
  ('PACKAGE_FORM', 'BOX', 'Caja', 'BOX', 10),
  ('PACKAGE_FORM', 'PACKAGE', 'Paquete', 'PACKAGE', 20),
  ('PACKAGE_FORM', 'BUNDLE', 'Bulto', 'BUNDLE', 30),
  ('PACKAGE_FORM', 'PALLET', 'Pallet', 'PALLET', 40),
  ('PACKAGE_FORM', 'LOOSE_ITEM', 'Artículo suelto', 'LOOSE_ITEM', 50),
  ('PACKAGE_FORM', 'CRATE', 'Huacal', 'CRATE', 60),
  ('PACKAGE_FORM', 'OTHER', 'Otro', 'OTHER', 70),
  ('ITEM_NAME', 'FURNITURE', 'Mobiliario', NULL, 10),
  ('ITEM_NAME', 'SOFA', 'Sofá', NULL, 20),
  ('ITEM_NAME', 'CHAIR', 'Silla', NULL, 30),
  ('ITEM_NAME', 'TABLE', 'Mesa', NULL, 40),
  ('ITEM_NAME', 'BED_MATTRESS', 'Cama o colchón', NULL, 50),
  ('ITEM_NAME', 'CLOTHING', 'Ropa', NULL, 60),
  ('ITEM_NAME', 'BOOKS_DOCUMENTS', 'Libros y documentos', NULL, 70),
  ('ITEM_NAME', 'KITCHEN', 'Cocina', NULL, 80),
  ('ITEM_NAME', 'APPLIANCE', 'Electrodoméstico', NULL, 90),
  ('ITEM_NAME', 'ART_DECOR', 'Arte y decoración', NULL, 100),
  ('ITEM_NAME', 'ELECTRONICS', 'Electrónica', NULL, 110),
  ('ITEM_NAME', 'TOOLS', 'Herramientas', NULL, 120),
  ('ITEM_NAME', 'COMMERCIAL_GOODS', 'Mercancía comercial', NULL, 130),
  ('ITEM_NAME', 'RAW_MATERIAL', 'Materia prima', NULL, 140),
  ('ITEM_NAME', 'OTHER', 'Otros', NULL, 150)
) AS seed("kind", "code", "label", "base_value", "sort_order");
