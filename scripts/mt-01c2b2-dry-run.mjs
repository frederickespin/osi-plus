import { createMt01c2b2LocalPrisma } from "./mt-01c2b2-local-target.mjs";
import { planMt01c2b2 } from "./mt-01c2b2-lib.mjs";

const { prisma, identity } = await createMt01c2b2LocalPrisma();
try {
  const result = await planMt01c2b2(prisma);
  process.stdout.write(`${JSON.stringify({ ok: true, target: identity, readOnly: result.readOnly, wroteRows: result.wroteRows, ...result.summary }, null, 2)}\n`);
} finally { await prisma.$disconnect(); }
