import { createMt01c1aPrisma, dryRunEmployeeProfiles, publicDryRunReport } from "./mt-01c1a-lib.mjs";

const prisma = createMt01c1aPrisma();
try {
  const report = await dryRunEmployeeProfiles(prisma);
  process.stdout.write(`${JSON.stringify(publicDryRunReport(report), null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
