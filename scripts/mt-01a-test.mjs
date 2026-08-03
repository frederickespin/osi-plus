import { randomUUID } from "node:crypto";
import { createMt01aPrisma, mt01aConfig } from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();
const config = mt01aConfig();
const results = [];

async function expectRejected(name, operation) {
  try {
    await operation();
    results.push({ name, passed: false, reason: "La operación fue aceptada" });
  } catch (error) {
    results.push({ name, passed: true, databaseCode: error?.code || "DATABASE_REJECTED" });
  }
}

try {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: config.code } });
  const membership = await prisma.tenantMembership.findFirstOrThrow({
    where: { tenantId: tenant.id }, select: { userId: true, role: true, status: true },
  });
  const temporaryTenant = await prisma.tenant.create({
    data: { id: randomUUID(), code: "MT01A-TEST", name: "MT-01A Constraint Test" },
  });

  await expectRejected("unique tenant/user membership", () => prisma.tenantMembership.create({
    data: {
      id: randomUUID(), tenantId: tenant.id, userId: membership.userId,
      role: membership.role, status: membership.status, isDefault: false,
    },
  }));
  await expectRejected("one default tenant per user", () => prisma.tenantMembership.create({
    data: {
      id: randomUUID(), tenantId: temporaryTenant.id, userId: membership.userId,
      role: membership.role, status: membership.status, isDefault: true,
    },
  }));
  await expectRejected("authorization version must be positive", () => prisma.tenantMembership.create({
    data: {
      id: randomUUID(), tenantId: temporaryTenant.id, userId: membership.userId,
      role: membership.role, status: membership.status, isDefault: false, authorizationVersion: 0,
    },
  }));
  await expectRejected("granted and denied permissions cannot overlap", () => prisma.tenantMembership.create({
    data: {
      id: randomUUID(), tenantId: temporaryTenant.id, userId: membership.userId,
      role: membership.role, status: membership.status, isDefault: false,
      grantedPermissions: ["osi:view"], deniedPermissions: ["osi:view"],
    },
  }));
  await expectRejected("membership restricts user deletion", () => prisma.user.delete({
    where: { id: membership.userId },
  }));
  await expectRejected("membership restricts tenant deletion", () => prisma.tenant.delete({
    where: { id: tenant.id },
  }));

  const enumRows = await prisma.$queryRawUnsafe(
    `SELECT unnest(enum_range(NULL::"osi"."TenantMembershipRole"))::text AS role`,
  );
  const enumRoles = enumRows.map((row) => row.role);
  results.push({
    name: "RB excluded from tenant membership roles",
    passed: !enumRoles.includes("RB"),
    enumRoles,
  });

  await prisma.tenant.delete({ where: { id: temporaryTenant.id } });
  const passed = results.every((result) => result.passed);
  console.log(JSON.stringify({ ok: passed, results }, null, 2));
  if (!passed) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
