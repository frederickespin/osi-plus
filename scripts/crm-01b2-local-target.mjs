const ALLOWED_DATABASES = new Set(["osi_crm01b2_local", "osi_db01n_ci"]);

function reject(message) { throw new Error(`CRM01B2_LOCAL_TARGET_REJECTED: ${message}`); }

export function validateCrm01b2LocalUrl(raw = process.env.CRM01B2_TEST_DATABASE_URL) {
  if (!raw) reject("CRM01B2_TEST_DATABASE_URL es obligatoria; no existe fallback");
  let url;
  try { url = new URL(raw); } catch { reject("URL inválida"); }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!["postgres:", "postgresql:"].includes(url.protocol)) reject("protocolo no PostgreSQL");
  if (url.hostname !== "127.0.0.1") reject("host debe ser exactamente 127.0.0.1");
  if (url.port !== "55432") reject("puerto debe ser exactamente 55432");
  if (!ALLOWED_DATABASES.has(database)) reject("base fuera de la allowlist local");
  if (url.searchParams.get("schema") !== "osi") reject("schema debe ser osi");
  if (!url.username || !url.password) reject("credenciales locales incompletas");
  if (/(?:neon|pooler)/i.test(raw)) reject("Neon y poolers están prohibidos");
  return Object.freeze({ raw, host: "127.0.0.1", port: 55432, database, schema: "osi" });
}

export function validateCrm01b2DatabaseIdentity(identity, target) {
  const address = String(identity?.address || "").split("/")[0];
  if (identity?.database !== target.database) reject("current_database no coincide");
  if (identity?.schema !== "osi") reject("current_schema no coincide");
  if (address !== "127.0.0.1") reject("servidor no loopback");
  if (Number(identity?.port) !== 55432) reject("puerto inesperado");
  if (identity?.neon_branch_id) reject("se detectó neon.branch_id");
  return Object.freeze({ database: identity.database, schema: identity.schema, address, port: Number(identity.port) });
}

export async function createCrm01b2LocalPrisma(raw = process.env.CRM01B2_TEST_DATABASE_URL) {
  const target = validateCrm01b2LocalUrl(raw);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: target.raw });
  try {
    const [identity] = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_addr()::text AS address, inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon_branch_id
    `);
    return { prisma, target: validateCrm01b2DatabaseIdentity(identity, target) };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
