ALTER TABLE "account_pricing_profiles"
  ADD COLUMN "service_type" TEXT,
  ADD COLUMN "service_mode" TEXT,
  ADD COLUMN "customer_type" TEXT;

CREATE INDEX "account_pricing_profiles_service_type_service_mode_customer_type_is_active_idx"
  ON "account_pricing_profiles"("service_type", "service_mode", "customer_type", "is_active");

-- Los registros anteriores quedan sin criterios para evitar una selección
-- automática incorrecta. Deben clasificarse desde Relación Comercial.
