import { createMt01c1aPrisma, rollbackEmployeeProfileBackfill } from "./mt-01c1a-lib.mjs";

const prisma = createMt01c1aPrisma();
try {
  const result = await rollbackEmployeeProfileBackfill(prisma);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
