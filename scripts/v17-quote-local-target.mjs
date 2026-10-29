import { validateAppliedMigrationHistory } from "./canonical-migrations.mjs";

const ISOLATED_DATABASES = Object.freeze(["v17_quote_test", "v17_quote_replay", "v17_quote_empty"]);
function invariant(condition, message) {
  if (!condition) throw new Error(`V17_QUOTE_LOCAL_TARGET_REJECTED: ${message}`);
}

export function validateV17QuoteTestUrl(raw = process.env.V17_QUOTE_TEST_DATABASE_URL, env = process.env) {
  invariant(raw, "V17_QUOTE_TEST_DATABASE_URL es obligatoria; no existe fallback");
  let url;
  try { url = new URL(raw); } catch { throw new Error("V17_QUOTE_LOCAL_TARGET_REJECTED: URL inválida"); }
  invariant(["postgres:", "postgresql:"].includes(url.protocol), "protocolo no PostgreSQL");
  invariant(url.hostname === "127.0.0.1" && url.port === "55432", "destino debe ser 127.0.0.1:55432");
  invariant(!url.hash, "fragmentos no permitidos");
  invariant([...url.searchParams.keys()].every((key) => key === "schema")
    && url.searchParams.getAll("schema").length === 1 && url.searchParams.get("schema") === "osi",
  "parámetros deben ser exclusivamente schema=osi");
  invariant(Boolean(url.username) && Boolean(url.password), "credenciales locales incompletas");
  invariant(!/(?:neon|pooler)/i.test(raw), "Neon y poolers están prohibidos");
  const database = url.pathname.slice(1);
  const canonicalCi = database === "osi_db01n_ci" && env.CANONICAL_DB_VALIDATION === "true";
  invariant(canonicalCi || ISOLATED_DATABASES.includes(database), "base fuera de perfiles locales aprobados");
  return Object.freeze({ raw, host: "127.0.0.1", port: 55432, database, schema: "osi", canonicalCi });
}

export function validateV17QuoteDatabaseIdentity(identity, target) {
  invariant(identity?.database === target.database && identity?.schema === target.schema, "identidad de base/esquema no coincide");
  invariant(String(identity?.address || "").split("/")[0] === target.host && Number(identity?.port) === target.port,
    "identidad del servidor no coincide con loopback aprobado");
  invariant(!identity?.neon_branch_id, "se detectó neon.branch_id");
  invariant(Number(identity?.version_number) >= 180000 && Number(identity?.version_number) < 190000,
    "fixture requiere PostgreSQL18");
  return Object.freeze({ database: identity.database, schema: identity.schema, address: target.host, port: target.port });
}

export async function createV17QuoteLocalPrisma(raw, env = process.env) {
  const target = validateV17QuoteTestUrl(raw, env);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: target.raw });
  try {
    const [identity] = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_addr()::text AS address, inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon_branch_id,
             current_setting('server_version_num') AS version_number
    `);
    const safeIdentity = validateV17QuoteDatabaseIdentity(identity, target);
    const history = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM "osi"."_prisma_migrations" ORDER BY migration_name
    `);
    const migrations = validateAppliedMigrationHistory(history, {
      throughMigration: target.canonicalCi ? undefined : "20260910010000_v17_quote",
    });
    return { prisma, target: safeIdentity, migrations };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
