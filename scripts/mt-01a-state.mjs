import { createHash } from "node:crypto";
import { createMt01aPrisma, mt01aConfig } from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();
const config = mt01aConfig();

try {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, code: true, email: true, role: true, status: true, employeeProfile: true },
  });
  const tenant = await prisma.tenant.findUnique({ where: { code: config.code } });
  const membershipCount = tenant
    ? await prisma.tenantMembership.count({ where: { tenantId: tenant.id } })
    : 0;
  const userStateHash = createHash("sha256").update(JSON.stringify(users)).digest("hex");
  console.log(JSON.stringify({
    users: users.length,
    userStateHash,
    tenantExists: Boolean(tenant),
    membershipCount,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
