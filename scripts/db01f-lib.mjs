import { PrismaClient } from "@prisma/client";

export function loadDb01fEnvironment() {
  const raw = String(process.env.DB01F_DATABASE_URL || "").trim();
  if (!raw) throw new Error("DB01F_DATABASE_URL es obligatoria");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname) ||
      url.port !== "55432" || !(database.startsWith("osi_db01f_") || database.startsWith("osi_db01n_") || database === "osi_mt01c1b3a_q1_20260809")) {
    throw new Error("DB-01F rechazó una conexión que no es local y aislada");
  }
  process.env.DATABASE_URL = url.toString();
  return { url, database };
}

export function createDb01fPrisma() {
  const { url } = loadDb01fEnvironment();
  return new PrismaClient({ datasourceUrl: url.toString() });
}
