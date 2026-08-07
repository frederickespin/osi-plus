import { createMt01c1b1Prisma, dryRunNormalizedEmails } from "./mt-01c1b1-email-normalization.mjs";

const prisma = createMt01c1b1Prisma();
try {
  const report = await dryRunNormalizedEmails(prisma);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
