ALTER TABLE "master_tariffs"
  ADD COLUMN IF NOT EXISTS "coverage_options" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "service_rules" JSONB NOT NULL DEFAULT '[]'::jsonb;
