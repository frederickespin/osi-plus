import { randomUUID } from "node:crypto";
import {
  createMt01aPrisma,
  MT01A_ROLES,
  mt01aConfig,
  normalizedRole,
  tenantStatusForUser,
} from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();
const config = mt01aConfig();

try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('MT-01A:IPACKERS-DO'))");
    const users = await tx.user.findMany({ select: { id: true, role: true, status: true } });
    const prepared = users.map((user) => {
      const role = normalizedRole(user.role);
      if (!MT01A_ROLES.includes(role)) throw new Error(`Rol inválido para MT-01A: ${role}`);
      return { userId: user.id, role, status: tenantStatusForUser(user.status) };
    });

    let tenant = await tx.tenant.findUnique({ where: { code: config.code } });
    if (tenant && tenant.name !== config.name) {
      throw new Error(`El código ${config.code} pertenece a otro tenant: ${tenant.name}`);
    }
    if (!tenant) {
      tenant = await tx.tenant.create({
        data: {
          id: randomUUID(), code: config.code, name: config.name, legalName: config.name,
          countryCode: "DO", timezone: "America/Santo_Domingo", defaultCurrency: "DOP",
          provisioningSource: "BACKFILL", provisioningBatchId: config.batchId,
        },
      });
    }

    const userIds = prepared.map((entry) => entry.userId);
    const foreignDefaults = await tx.tenantMembership.count({
      where: { userId: { in: userIds }, isDefault: true, tenantId: { not: tenant.id } },
    });
    if (foreignDefaults > 0) throw new Error(`${foreignDefaults} usuarios ya tienen otro tenant predeterminado`);

    const existing = new Set((await tx.tenantMembership.findMany({
      where: { tenantId: tenant.id, userId: { in: userIds } }, select: { userId: true },
    })).map((membership) => membership.userId));
    const missing = prepared.filter((entry) => !existing.has(entry.userId));
    const inserted = missing.length === 0 ? { count: 0 } : await tx.tenantMembership.createMany({
      data: missing.map((entry) => ({
        id: randomUUID(), tenantId: tenant.id, userId: entry.userId,
        role: entry.role, status: entry.status, isDefault: true,
        provisioningSource: "BACKFILL", provisioningBatchId: config.batchId,
      })),
      skipDuplicates: true,
    });
    const finalCount = await tx.tenantMembership.count({ where: { tenantId: tenant.id } });
    if (finalCount !== users.length) throw new Error(`Conteo final inesperado: ${finalCount}/${users.length}`);
    return { tenantId: tenant.id, users: users.length, created: inserted.count, existing: users.length - inserted.count, finalCount };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ ok: true, batchId: config.batchId, ...result }, null, 2));
} finally {
  await prisma.$disconnect();
}
