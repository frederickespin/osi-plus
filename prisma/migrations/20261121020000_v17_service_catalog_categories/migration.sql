BEGIN;

CREATE TABLE "osi"."service_catalog_categories" (
  "id" TEXT NOT NULL,
  "category_ref" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "service_catalog_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_catalog_categories_version_check" CHECK ("version" >= 1),
  CONSTRAINT "service_catalog_categories_tenant_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "osi"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "service_catalog_categories_tenant_code_key" ON "osi"."service_catalog_categories"("tenant_id", "code");
CREATE UNIQUE INDEX "service_catalog_categories_tenant_ref_key" ON "osi"."service_catalog_categories"("tenant_id", "category_ref");

COMMIT;
