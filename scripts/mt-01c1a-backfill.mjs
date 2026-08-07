import { applyEmployeeProfileBackfill, createMt01c1aPrisma } from "./mt-01c1a-lib.mjs";

const prisma = createMt01c1aPrisma();
try {
  const result = await applyEmployeeProfileBackfill(prisma);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || "MT01C1A_BACKFILL_FAILED", message: error.message, summary: error.summary || null }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
