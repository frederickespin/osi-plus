-- DB-01M: mover historias Prisma previas a un esquema fuera del datasource osi.
-- Ejecutar únicamente después de capturar y comparar conteos/fingerprints.
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('DB-01M:PRESERVE-HISTORIES'));

DO $$
BEGIN
  IF to_regnamespace('db01_legacy') IS NOT NULL THEN
    RAISE EXCEPTION 'DB01M_LEGACY_SCHEMA_ALREADY_EXISTS';
  END IF;
  IF to_regclass('public._prisma_migrations') IS NULL
     OR to_regclass('osi._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'DB01M_EXPECTED_HISTORY_MISSING';
  END IF;
END $$;

CREATE SCHEMA db01_legacy;
REVOKE ALL ON SCHEMA db01_legacy FROM PUBLIC;

ALTER TABLE public._prisma_migrations
  RENAME CONSTRAINT _prisma_migrations_pkey TO public_prisma_migrations_pre_db01_pkey;
ALTER TABLE osi._prisma_migrations
  RENAME CONSTRAINT _prisma_migrations_pkey TO osi_prisma_migrations_pre_db01_pkey;

ALTER TABLE public._prisma_migrations SET SCHEMA db01_legacy;
ALTER TABLE db01_legacy._prisma_migrations RENAME TO public_prisma_migrations_pre_db01;
ALTER TABLE osi._prisma_migrations SET SCHEMA db01_legacy;
ALTER TABLE db01_legacy._prisma_migrations RENAME TO osi_prisma_migrations_pre_db01;

COMMENT ON SCHEMA db01_legacy IS
  'DB-01: historias Prisma previas; acceso administrativo y auditoría únicamente';
COMMENT ON TABLE db01_legacy.public_prisma_migrations_pre_db01 IS
  'Historia Prisma original de public previa a DB-01';
COMMENT ON TABLE db01_legacy.osi_prisma_migrations_pre_db01 IS
  'Historia Prisma original de osi previa a DB-01';
REVOKE ALL ON ALL TABLES IN SCHEMA db01_legacy FROM PUBLIC;
COMMIT;
