const ALLOWED_DATABASES = Object.freeze(new Set(["osi_db01n_ci"]));
const FORBIDDEN_OVERRIDE = /^MT01C1B2B_.*(?:OVERRIDE|SKIP|UNSAFE|ALLOW_EXTERNAL)/i;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function validateMt01c1b2bTestDatabaseEnv(env = process.env) {
  for (const [name, value] of Object.entries(env)) {
    if (FORBIDDEN_OVERRIDE.test(name) && String(value || "").trim()) {
      fail("MT01C1B2B_DATABASE_OVERRIDE_FORBIDDEN", "MT-01C1B2B no admite bypass ni flags de override");
    }
  }

  const raw = String(env.MT01C1B2B_TEST_DATABASE_URL || "").trim();
  if (!raw) fail("MT01C1B2B_TEST_DATABASE_URL_REQUIRED", "MT01C1B2B_TEST_DATABASE_URL es obligatoria");

  let url;
  try { url = new URL(raw); }
  catch { fail("MT01C1B2B_TEST_DATABASE_URL_INVALID", "La URL de pruebas no es válida"); }

  if (url.protocol !== "postgresql:") fail("MT01C1B2B_DATABASE_PROTOCOL_INVALID", "La URL debe usar PostgreSQL");
  if (url.hostname !== "127.0.0.1") fail("MT01C1B2B_DATABASE_HOST_FORBIDDEN", "La suite exige el host exacto 127.0.0.1");
  if (url.port !== "55432") fail("MT01C1B2B_DATABASE_PORT_FORBIDDEN", "La suite exige el puerto aislado 55432");
  if (!url.username || !url.password) fail("MT01C1B2B_DATABASE_CREDENTIALS_REQUIRED", "La conexión local de pruebas exige credenciales sintéticas");

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!ALLOWED_DATABASES.has(database)) fail("MT01C1B2B_DATABASE_NAME_FORBIDDEN", "La base no pertenece a la allowlist local de MT-01C1B2B");

  const schemas = url.searchParams.getAll("schema");
  if (schemas.length !== 1 || schemas[0] !== "osi") fail("MT01C1B2B_DATABASE_SCHEMA_FORBIDDEN", "La URL debe declarar exactamente schema=osi");
  if (/neon|pooler/i.test(raw)) fail("MT01C1B2B_DATABASE_PROVIDER_FORBIDDEN", "Neon y conexiones pooled están prohibidos para esta suite");

  return Object.freeze({
    url: url.toString(),
    host: "127.0.0.1",
    port: 55432,
    database,
    schema: "osi",
  });
}

export async function verifyMt01c1b2bConnectedDatabase(prisma, expected) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT current_database() AS database,
           host(inet_server_addr()) AS server_address,
           inet_server_port() AS server_port,
           current_schema() AS schema,
           current_setting('neon.branch_id', true) AS neon_branch_id
  `);
  const identity = rows?.[0];
  if (!identity) fail("MT01C1B2B_DATABASE_IDENTITY_MISSING", "No se pudo comprobar la identidad PostgreSQL");
  if (identity.database !== expected.database) fail("MT01C1B2B_DATABASE_IDENTITY_MISMATCH", "La base conectada no coincide con la base local autorizada");
  if (identity.server_address !== "127.0.0.1") fail("MT01C1B2B_DATABASE_ADDRESS_FORBIDDEN", "La dirección PostgreSQL conectada no es loopback IPv4");
  if (Number(identity.server_port) !== expected.port) fail("MT01C1B2B_DATABASE_PORT_MISMATCH", "El puerto PostgreSQL conectado no coincide");
  if (identity.schema !== expected.schema) fail("MT01C1B2B_DATABASE_SCHEMA_MISMATCH", "El esquema PostgreSQL conectado no es osi");
  if (String(identity.neon_branch_id || "").trim()) fail("MT01C1B2B_NEON_BRANCH_DETECTED", "Se detectó neon.branch_id; la suite se detuvo antes de escribir");
  return Object.freeze({ host: expected.host, port: expected.port, database: expected.database, schema: expected.schema });
}

export function formatMt01c1b2bSanitizedIdentity(identity) {
  return `host=${identity.host} port=${identity.port} database=${identity.database} schema=${identity.schema}`;
}

export const MT01C1B2B_ALLOWED_TEST_DATABASES = Object.freeze([...ALLOWED_DATABASES]);
