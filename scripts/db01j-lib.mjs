import { PrismaClient } from "@prisma/client";

export function assertDb01jLocalUrl(value = process.env.DB01J_DATABASE_URL) {
  if (!value) throw new Error("DB01J_DATABASE_URL es obligatoria.");
  const url = new URL(value);
  const database = url.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || Number(url.port) !== 55432 || !(database.startsWith("osi_db01j_") || database.startsWith("osi_db01n_"))) {
    throw new Error("DB-01J sólo admite PostgreSQL local 127.0.0.1:55432 y bases osi_db01j_*.");
  }
  return value;
}

export function createDb01jPrisma() {
  assertDb01jLocalUrl();
  return new PrismaClient();
}
