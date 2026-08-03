import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const MT01A_ROLES = Object.freeze([
  "A", "V", "K", "B", "C", "C1", "D", "E", "G", "N",
  "PA", "PB", "PC", "PD", "PF", "I", "PE",
]);

export const MT01A_STATUSES = Object.freeze({
  active: "ACTIVE",
  inactive: "INACTIVE",
  suspended: "SUSPENDED",
});

function parseEnvFile(contents) {
  const result = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  }
  return result;
}

export function loadMt01aEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.mt01a.local");
  if (!fs.existsSync(envPath)) throw new Error(`Falta ${envPath}`);
  const localEnv = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(localEnv)) process.env[key] = value;

  const url = new URL(process.env.DATABASE_URL || "");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`MT-01A safety guard rechazó el host ${url.hostname}`);
  }
  if (url.port !== "55432" || (database !== "osi_plus_mt01a_dev" && !database.startsWith("osi_db01n_"))) {
    throw new Error("MT-01A safety guard rechazó una base o puerto no aislado");
  }
  if (process.env.VERCEL_ENV !== "development") {
    throw new Error("MT-01A requiere VERCEL_ENV=development");
  }
  return { envPath, url };
}

export function createMt01aPrisma() {
  loadMt01aEnvironment();
  return new PrismaClient();
}

export function normalizedRole(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizedStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function tenantStatusForUser(value) {
  const normalized = normalizedStatus(value);
  const mapped = MT01A_STATUSES[normalized];
  if (!mapped) throw new Error(`Estado de usuario inválido para MT-01A: ${value}`);
  return mapped;
}

export function mt01aConfig() {
  return {
    code: process.env.MT01A_INITIAL_TENANT_CODE || "IPACKERS-DO",
    name: process.env.MT01A_INITIAL_TENANT_NAME || "International Packers SRL",
    batchId: process.env.MT01A_BACKFILL_BATCH_ID || "MT-01A-IPACKERS-DO-V1",
  };
}
