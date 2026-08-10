import { PrismaClient } from "@prisma/client";

const ALLOWED_DATABASES = Object.freeze(new Set([
  "osi_db01n_ci",
  "osi_db01n_mt01c2b1_local",
  "osi_mt01c2b1_local",
]));

function invariant(condition, message) {
  if (!condition) throw new Error(`MT01C2B1_LOCAL_TARGET_REJECTED: ${message}`);
}

export function validateMt01c2b1LocalUrl(raw = process.env.MT01C2B1_TEST_DATABASE_URL) {
  invariant(raw, "MT01C2B1_TEST_DATABASE_URL es obligatoria; no existe fallback");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MT01C2B1_LOCAL_TARGET_REJECTED: URL inválida");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  invariant(["postgres:", "postgresql:"].includes(url.protocol), "protocolo no PostgreSQL");
  invariant(url.hostname === "127.0.0.1", "host debe ser exactamente 127.0.0.1");
  invariant(url.port === "55432", "puerto debe ser exactamente 55432");
  invariant(ALLOWED_DATABASES.has(database), "base fuera de la allowlist local");
  invariant(url.searchParams.get("schema") === "osi", "schema debe ser osi");
  invariant(Boolean(url.username) && Boolean(url.password), "credenciales locales incompletas");
  invariant(!/(?:neon|pooler)/i.test(raw), "Neon y poolers están prohibidos");
  return Object.freeze({ raw, host: "127.0.0.1", port: 55432, database, schema: "osi" });
}

export async function createMt01c2b1LocalPrisma() {
  const target = validateMt01c2b1LocalUrl();
  const prisma = new PrismaClient({ datasourceUrl: target.raw });
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS database,
             current_schema() AS schema,
             inet_server_addr()::text AS address,
             inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon_branch_id
    `);
    const identity = rows[0] || {};
    invariant(identity.database === target.database, "current_database no coincide");
    invariant(identity.schema === "osi", "current_schema no coincide");
    const address = String(identity.address || "").split("/")[0];
    invariant(address === "127.0.0.1", "servidor no loopback");
    invariant(Number(identity.port) === 55432, "puerto del servidor inesperado");
    invariant(!identity.neon_branch_id, "se detectó neon.branch_id");
    return { prisma, identity: Object.freeze({ database: identity.database, schema: identity.schema, address, port: Number(identity.port) }) };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
