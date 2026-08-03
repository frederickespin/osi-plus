import { PrismaClient } from "@prisma/client";

export function loadDb01gEnvironment() {
  const raw = String(process.env.DB01G_DATABASE_URL || process.env.DB01F_DATABASE_URL || "").trim();
  if (!raw) throw new Error("DB01G_DATABASE_URL o DB01F_DATABASE_URL es obligatoria");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname) ||
      url.port !== "55432" || !(database.startsWith("osi_db01f_") || database.startsWith("osi_db01n_"))) {
    throw new Error("DB-01G rechazó una conexión que no es local y aislada");
  }
  process.env.DB01F_DATABASE_URL = url.toString();
  return { url, database };
}

export function createDb01gPrisma() {
  const { url } = loadDb01gEnvironment();
  return new PrismaClient({ datasourceUrl: url.toString() });
}
