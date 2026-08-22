const ALLOWED_DATABASES = Object.freeze(new Set([
  "osi_db01n_ci",
  "osi_v17_case_public_ref_local",
  "osi_v17_case_public_ref_populated",
]));

function invariant(condition, message) {
  if (!condition) throw new Error(`V17_CASE_PUBLIC_REF_LOCAL_TARGET_REJECTED: ${message}`);
}

export function validateV17CasePublicRefLocalUrl(raw = process.env.V17_CASE_PUBLIC_REF_TEST_DATABASE_URL) {
  invariant(raw, "V17_CASE_PUBLIC_REF_TEST_DATABASE_URL es obligatoria; no existe fallback");
  let url;
  try { url = new URL(raw); } catch { throw new Error("V17_CASE_PUBLIC_REF_LOCAL_TARGET_REJECTED: URL inválida"); }
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

export async function createV17CasePublicRefLocalPrisma(raw = process.env.V17_CASE_PUBLIC_REF_TEST_DATABASE_URL) {
  const target = validateV17CasePublicRefLocalUrl(raw);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: target.raw });
  try {
    const [identity] = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS database, current_schema() AS schema,
             inet_server_addr()::text AS address, inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon_branch_id
    `);
    const address = String(identity?.address || "").split("/")[0];
    invariant(identity?.database === target.database, "current_database no coincide");
    invariant(identity?.schema === "osi", "current_schema no coincide");
    invariant(address === "127.0.0.1" && Number(identity?.port) === 55432, "servidor no loopback exacto");
    invariant(!identity?.neon_branch_id, "se detectó neon.branch_id");
    return { prisma, target: Object.freeze({ database: target.database, schema: "osi", address, port: 55432 }) };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
