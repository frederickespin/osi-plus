import { createMt01aPrisma, mt01aConfig } from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();
const config = mt01aConfig();

try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('MT-01A:IPACKERS-DO'))");
    const tenant = await tx.tenant.findUnique({ where: { code: config.code } });
    if (!tenant) return { membershipsDeleted: 0, tenantDeleted: false };
    const deleted = await tx.tenantMembership.deleteMany({
      where: { tenantId: tenant.id, provisioningSource: "BACKFILL", provisioningBatchId: config.batchId },
    });
    const remaining = await tx.tenantMembership.count({ where: { tenantId: tenant.id } });
    let tenantDeleted = false;
    if (remaining === 0 && tenant.provisioningSource === "BACKFILL" && tenant.provisioningBatchId === config.batchId) {
      await tx.tenant.delete({ where: { id: tenant.id } });
      tenantDeleted = true;
    }
    return { membershipsDeleted: deleted.count, membershipsPreserved: remaining, tenantDeleted };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ ok: true, batchId: config.batchId, ...result }, null, 2));
} finally {
  await prisma.$disconnect();
}
