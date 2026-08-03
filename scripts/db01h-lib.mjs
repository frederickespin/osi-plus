import { PrismaClient } from "@prisma/client";

export function loadDb01hEnvironment() {
  const raw = String(process.env.DB01H_DATABASE_URL || "").trim();
  if (!raw) throw new Error("DB01H_DATABASE_URL es obligatoria");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname) || url.port !== "55432" || !(database.startsWith("osi_db01h_") || database.startsWith("osi_db01n_"))) {
    throw new Error("DB-01H rechazó una conexión que no es local y aislada");
  }
  process.env.DB01H_DATABASE_URL = url.toString();
  return { url, database };
}

export function createDb01hPrisma() {
  const { url } = loadDb01hEnvironment();
  return new PrismaClient({ datasourceUrl: url.toString() });
}
