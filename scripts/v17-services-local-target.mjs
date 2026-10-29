function invariant(condition, message) {
  if (!condition) throw new Error(`V17_SERVICES_TEST_DATABASE_TARGET_REJECTED: ${message}`);
}

export function validateV17ServicesTestUrl(raw = process.env.V17_SERVICES_TEST_DATABASE_URL, env = process.env) {
  if (!raw) throw new Error("V17_SERVICES_TEST_DATABASE_URL_REQUIRED");
  let url;
  try { url = new URL(raw); } catch { throw new Error("V17_SERVICES_TEST_DATABASE_TARGET_REJECTED: URL inválida"); }
  invariant(url.protocol === "postgresql:", "protocolo no PostgreSQL");
  invariant(["127.0.0.1", "localhost"].includes(url.hostname), "host fuera de loopback aprobado");
  invariant(!url.hash, "fragmentos no permitidos");
  invariant([...url.searchParams.keys()].every((key) => key === "schema")
    && url.searchParams.getAll("schema").length === 1 && url.searchParams.get("schema") === "osi",
  "parámetros deben ser exclusivamente schema=osi");
  const database = url.pathname.slice(1);
  const historical = url.port === "55439" && database === "postgres";
  const canonicalCi = url.hostname === "127.0.0.1" && url.port === "55432"
    && database === "osi_db01n_ci" && env.CANONICAL_DB_VALIDATION === "true";
  invariant(historical || canonicalCi, "base, puerto o activación fuera de perfiles locales aprobados");
  return Object.freeze({ raw, host: url.hostname, port: Number(url.port), database, schema: "osi", canonicalCi });
}

export function validateV17ServicesDatabaseIdentity(identity, target, migrationSchemas) {
  invariant(identity?.database === target.database && identity?.schema === "osi", "identidad de base/esquema no coincide");
  const address = String(identity?.address || "").split("/")[0];
  invariant((target.host === "localhost" ? ["127.0.0.1", "::1"].includes(address) : address === "127.0.0.1")
    && Number(identity?.port) === target.port, "identidad real del servidor no coincide con loopback y puerto aprobados");
  invariant(!identity?.neon, "se detectó neon.branch_id");
  invariant(Number(identity?.version_number) >= 180000 && Number(identity?.version_number) < 190000,
    "fixture requiere PostgreSQL18");
  invariant(Array.isArray(migrationSchemas) && migrationSchemas.length === 1 && migrationSchemas[0] === "osi",
    "debe existir una sola _prisma_migrations en osi");
  return Object.freeze({ database: identity.database, schema: "osi", address, port: target.port });
}

export async function verifyV17ServicesLocalDatabase(prisma, target) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const rows = await tx.$queryRawUnsafe(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_addr()::text AS address, inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon,
             current_setting('server_version_num') AS version_number
    `);
    invariant(rows.length === 1, "identidad PostgreSQL no es única");
    const schemas = await tx.$queryRawUnsafe(`
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = '_prisma_migrations' ORDER BY table_schema
    `);
    return validateV17ServicesDatabaseIdentity(rows[0], target, schemas.map((row) => row.table_schema));
  }, { maxWait: 5_000, timeout: 10_000 });
}
