import { createMt01aPrisma } from "./mt-01a-lib.mjs";

const prisma = createMt01aPrisma();
const roles = ["A", "B", "I", "C", "K", "K", "E", "E", "E", "E", "E", "V", "V", "V", "V", "V", "V", "V"];

try {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const synthetic = await prisma.user.count({ where: { email: { endsWith: "@example.invalid" } } });
    if (existing === 18 && synthetic === 18) {
      console.log(JSON.stringify({ ok: true, created: 0, existing, synthetic }, null, 2));
      process.exit(0);
    }
    throw new Error(`La base local contiene ${existing} usuarios no esperados; no se insertarán fixtures`);
  }

  const data = roles.map((role, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    return {
      code: `DEV${sequence}`,
      name: `Synthetic User ${sequence}`,
      email: `synthetic${sequence}@example.invalid`,
      phone: `+10000000${sequence}`,
      employeeProfile: {
        contractType: index < 6 ? "Planta" : "Personal Móvil",
        baseSkills: [],
        shabActive: [],
        allowanceTypeIds: [],
      },
      role,
      status: "active",
      department: `Synthetic ${role}`,
      joinDate: "2026-01-01",
      passwordHash: "$synthetic$not-a-login-credential",
    };
  });
  const result = await prisma.user.createMany({ data });
  console.log(JSON.stringify({ ok: true, created: result.count, syntheticOnly: true }, null, 2));
} finally {
  await prisma.$disconnect();
}
