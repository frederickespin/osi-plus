import { PrismaClient } from "@prisma/client";

export function loadDb01dEnvironment() {
  const raw = String(process.env.DB01D_DATABASE_URL || "").trim();
  if (!raw) throw new Error("DB01D_DATABASE_URL es obligatoria");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    !new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname) ||
    url.port !== "55432" ||
    !(database.startsWith("osi_db01d_") || database.startsWith("osi_db01n_") || database === "osi_mt01c1b3a_q1_20260809")
  ) {
    throw new Error("DB-01D rechazó una conexión que no es local o aislada");
  }
  process.env.DATABASE_URL = url.toString();
  return { url, database };
}

export function createDb01dPrisma() {
  const { url } = loadDb01dEnvironment();
  return new PrismaClient({ datasourceUrl: url.toString() });
}
