import { createMt01c2b2LocalPrisma } from "./mt-01c2b2-local-target.mjs";
import { rollbackMt01c2b2 } from "./mt-01c2b2-lib.mjs";
import { readMt01c2b2Envelope, resolveMt01c2b2ManifestPath, writeMt01c2b2EnvelopeAtomic } from "./mt-01c2b2-manifest.mjs";

const manifestPath = resolveMt01c2b2ManifestPath();
const envelope = readMt01c2b2Envelope(manifestPath);
if (!["APPLIED", "ROLLED_BACK"].includes(envelope.phase)) throw new Error("MT01C2B2_MANIFEST_NOT_APPLIED");
const { prisma, identity } = await createMt01c2b2LocalPrisma();
try {
  const result = await rollbackMt01c2b2(prisma, envelope.manifest);
  writeMt01c2b2EnvelopeAtomic(manifestPath, { ...envelope, phase: "ROLLED_BACK", rolledBackAt: envelope.rolledBackAt || new Date().toISOString() });
  process.stdout.write(`${JSON.stringify({ ok: true, target: identity, ...result }, null, 2)}\n`);
} finally { await prisma.$disconnect(); }
