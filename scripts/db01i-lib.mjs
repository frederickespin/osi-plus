import { PrismaClient } from "@prisma/client";

export function assertDb01iLocalUrl(value = process.env.DB01I_DATABASE_URL) {
  if (!value) throw new Error("DB01I_DATABASE_URL es obligatoria.");
  const url = new URL(value);
  const database = url.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || Number(url.port) !== 55432 || !(database.startsWith("osi_db01i_") || database.startsWith("osi_db01n_") || database === "osi_mt01c1b3a_q1_20260809")) {
    throw new Error("DB-01I sólo admite PostgreSQL local 127.0.0.1:55432 y bases osi_db01i_*.");
  }
  return value;
}

export function createDb01iPrisma() {
  assertDb01iLocalUrl();
  return new PrismaClient();
}
