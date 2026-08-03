import {
  createMt01aPrisma,
  MT01A_ROLES,
  MT01A_STATUSES,
  mt01aConfig,
  normalizedRole,
  normalizedStatus,
} from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();

function duplicateGroups(values) {
  const counts = new Map();
  for (const raw of values) {
    const value = String(raw || "").trim().toLowerCase();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

try {
  const users = await prisma.user.findMany({
    select: { id: true, code: true, email: true, role: true, status: true, employeeProfile: true },
  });
  const roleCounts = {};
  const statusCounts = {};
  const invalidRoles = {};
  const invalidStatuses = {};
  let malformedEmails = 0;
  let invalidProfiles = 0;

  for (const user of users) {
    const role = normalizedRole(user.role);
    const status = normalizedStatus(user.status);
    roleCounts[role || "(blank)"] = (roleCounts[role || "(blank)"] || 0) + 1;
    statusCounts[status || "(blank)"] = (statusCounts[status || "(blank)"] || 0) + 1;
    if (!MT01A_ROLES.includes(role)) invalidRoles[role || "(blank)"] = (invalidRoles[role || "(blank)"] || 0) + 1;
    if (!MT01A_STATUSES[status]) invalidStatuses[status || "(blank)"] = (invalidStatuses[status || "(blank)"] || 0) + 1;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || "").trim())) malformedEmails += 1;
    if (user.employeeProfile !== null && (Array.isArray(user.employeeProfile) || typeof user.employeeProfile !== "object")) invalidProfiles += 1;
  }

  const config = mt01aConfig();
  const existingTenant = await prisma.tenant.findUnique({ where: { code: config.code } });
  const existingMemberships = existingTenant
    ? await prisma.tenantMembership.count({ where: { tenantId: existingTenant.id } })
    : 0;
  const blocking = Object.values(invalidRoles).reduce((a, b) => a + b, 0)
    + Object.values(invalidStatuses).reduce((a, b) => a + b, 0);

  console.log(JSON.stringify({
    ok: blocking === 0,
    target: { tenantCode: config.code, batchId: config.batchId },
    totalUsers: users.length,
    membershipsToCreate: Math.max(0, users.length - existingMemberships),
    existingMemberships,
    roleCounts,
    statusCounts,
    invalidRoles,
    invalidStatuses,
    duplicateGroups: {
      normalizedEmails: duplicateGroups(users.map((user) => user.email)),
      normalizedCodes: duplicateGroups(users.map((user) => user.code)),
    },
    warnings: { malformedEmails, invalidProfiles },
    unmigratableRows: blocking,
  }, null, 2));
  if (blocking > 0) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
