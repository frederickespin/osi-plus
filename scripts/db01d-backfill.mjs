/* eslint-disable no-console */
import { randomUUID } from "node:crypto";
import { createDb01dPrisma } from "./db01d-lib.mjs";

const prisma = createDb01dPrisma();
const roleSet = new Set(["A", "V", "K", "B", "C", "C1", "D", "E", "G", "N", "PA", "PB", "PC", "PD", "PF", "I", "PE"]);
const statusMap = Object.freeze({ active: "ACTIVE", inactive: "INACTIVE", suspended: "SUSPENDED" });
const config = Object.freeze({
  code: "IPACKERS-DO",
  name: "International Packers SRL",
  batchId: "MT-01A-IPACKERS-DO-V1",
});

try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('DB-01D:MT-01A:IPACKERS-DO'))");
    const users = await tx.user.findMany({ select: { id: true, role: true, status: true } });
    const prepared = users.map((user) => {
      const role = String(user.role || "").trim().toUpperCase();
      const status = statusMap[String(user.status || "").trim().toLowerCase()];
      if (!roleSet.has(role)) throw new Error(`Rol User inválido: ${user.role}`);
      if (!status) throw new Error(`Estado User inválido: ${user.status}`);
      return { userId: user.id, role, status };
    });

    let tenant = await tx.tenant.findUnique({ where: { code: config.code } });
    if (tenant && tenant.name !== config.name) throw new Error(`${config.code} pertenece a otro tenant`);
    if (!tenant) {
      tenant = await tx.tenant.create({
        data: {
          id: randomUUID(),
          code: config.code,
          name: config.name,
          legalName: config.name,
          countryCode: "DO",
          timezone: "America/Santo_Domingo",
          defaultCurrency: "DOP",
          provisioningSource: "BACKFILL",
          provisioningBatchId: config.batchId,
        },
      });
    }

    const existing = new Set((await tx.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true },
    })).map((row) => row.userId));
    const missing = prepared.filter((entry) => !existing.has(entry.userId));
    const inserted = missing.length
      ? await tx.tenantMembership.createMany({
          data: missing.map((entry) => ({
            id: randomUUID(),
            tenantId: tenant.id,
            userId: entry.userId,
            role: entry.role,
            status: entry.status,
            isDefault: true,
            provisioningSource: "BACKFILL",
            provisioningBatchId: config.batchId,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };
    const finalCount = await tx.tenantMembership.count({ where: { tenantId: tenant.id } });
    if (finalCount !== users.length) throw new Error(`Conteo inesperado ${finalCount}/${users.length}`);
    return { tenantId: tenant.id, users: users.length, created: inserted.count, existing: users.length - inserted.count, finalCount };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ ok: true, batchId: config.batchId, ...result }, null, 2));
} finally {
  await prisma.$disconnect();
}
