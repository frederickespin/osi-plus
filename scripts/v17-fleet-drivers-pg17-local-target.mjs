const LOCAL_DATABASE = "osi_fleet_17_compat";
const LOCAL_PORT = 55433;

function invariant(condition, message) {
  if (!condition) throw new Error(`FLEET_DRIVERS_PG17_LOCAL_TARGET_REJECTED: ${message}`);
}

export function validateFleetDriversPg17LocalUrl(raw) {
  invariant(typeof raw === "string" && raw.length > 0, "URL local explícita obligatoria; no existe fallback");
  invariant(!/[\u0000-\u0020\u007f]/u.test(raw), "URL local contiene espacios o controles");
  let url; let database; let username; let password;
  try {
    url = new URL(raw);
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { invariant(false, "URL local inválida"); }
  invariant(["postgres:", "postgresql:"].includes(url.protocol), "protocolo no PostgreSQL");
  invariant(url.hostname === "127.0.0.1", "host debe ser exactamente 127.0.0.1");
  const port = Number(url.port);
  invariant(port === LOCAL_PORT, "puerto fuera del runner PG17 local");
  invariant(database === LOCAL_DATABASE, "base fuera del runner PG17 local");
  invariant(Boolean(username) && Boolean(password)
    && !/[\u0000-\u001f\u007f]/u.test(username + password), "credenciales locales incompletas o inválidas");
  invariant(!raw.includes("#"), "fragmentos prohibidos");
  invariant(!/(?:neon|pooler)/iu.test(raw), "Neon y poolers están prohibidos");
  const keys = [...url.searchParams.keys()];
  invariant(keys.every((key) => ["schema", "connection_limit"].includes(key))
    && new Set(keys).size === keys.length, "parámetros de conexión no permitidos o duplicados");
  invariant(url.searchParams.getAll("schema").length === 1
    && url.searchParams.get("schema") === "osi", "schema debe ser osi y aparecer una sola vez");
  const limit = url.searchParams.get("connection_limit");
  invariant(limit === null || /^(?:[1-9]|[1-9][0-9]|100)$/u.test(limit), "connection_limit debe ser entero entre 1 y 100");
  return Object.freeze({ raw, host: "127.0.0.1", port, database, schema: "osi" });
}

export function validateFleetDriversPg17DatabaseIdentity(identity, target) {
  invariant(target?.database === LOCAL_DATABASE && target.schema === "osi"
    && target.host === "127.0.0.1" && target.port === LOCAL_PORT, "destino local inválido");
  invariant(identity?.database === LOCAL_DATABASE, "current_database no coincide");
  invariant(identity?.schema === "osi", "current_schema no coincide");
  invariant(identity?.address === "127.0.0.1", "servidor no loopback exacto");
  invariant(Number(identity?.port) === target.port, "puerto real no coincide con URL");
  invariant(identity?.neon_branch_id === null, "neon.branch_id debe estar ausente");
  const serverVersion = Number(identity?.server_version_num);
  invariant(Number.isInteger(serverVersion) && serverVersion >= 170000 && serverVersion < 180000, "servidor debe ser PostgreSQL17");
  return Object.freeze({ database: identity.database, schema: identity.schema,
    address: identity.address, port: Number(identity.port), serverVersion });
}

export async function createFleetDriversPg17LocalPrisma(raw, { env = process.env } = {}) {
  invariant(env?.V17_FLEET_DRIVERS_LOCAL_COMPAT === "PG17", "modo PG17 explícito obligatorio");
  const target = validateFleetDriversPg17LocalUrl(raw);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: target.raw });
  try {
    const [identity] = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS database, current_schema() AS schema,
             host(inet_server_addr()) AS address, inet_server_port() AS port,
             current_setting('neon.branch_id', true) AS neon_branch_id,
             current_setting('server_version_num') AS server_version_num
    `);
    return { prisma, target: validateFleetDriversPg17DatabaseIdentity(identity, target) };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
