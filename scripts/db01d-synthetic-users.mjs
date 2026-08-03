/* eslint-disable no-console */
import { createDb01dPrisma } from "./db01d-lib.mjs";

const prisma = createDb01dPrisma();
const roles = ["A", "B", "I", "C", "K", "K", "E", "E", "E", "E", "E", "V", "V", "V", "V", "V", "V", "V"];

try {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const synthetic = await prisma.user.count({ where: { email: { endsWith: "@example.invalid" } } });
    if (existing !== 18 || synthetic !== 18) throw new Error(`Hay ${existing} usuarios no esperados`);
    console.log(JSON.stringify({ ok: true, created: 0, existing, synthetic }, null, 2));
  } else {
    const data = roles.map((role, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      return {
        id: `db01d-user-${sequence}`,
        code: `DB01D${sequence}`,
        name: `Synthetic User ${sequence}`,
        email: `db01d.synthetic${sequence}@example.invalid`,
        phone: `+10000000${sequence}`,
        employeeProfile: { contractType: "Synthetic", baseSkills: [], allowanceTypeIds: [] },
        role,
        status: "active",
        department: `Synthetic ${role}`,
        joinDate: "2026-01-01",
        passwordHash: "$synthetic$not-a-login-credential",
      };
    });
    const result = await prisma.user.createMany({ data });
    console.log(JSON.stringify({ ok: result.count === 18, created: result.count, syntheticOnly: true }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
