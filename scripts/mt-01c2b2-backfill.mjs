import { existsSync } from "node:fs";
import { createMt01c2b2LocalPrisma } from "./mt-01c2b2-local-target.mjs";
import { applyMt01c2b2, planMt01c2b2 } from "./mt-01c2b2-lib.mjs";
import { readMt01c2b2Envelope, resolveMt01c2b2ManifestPath, writeMt01c2b2EnvelopeAtomic } from "./mt-01c2b2-manifest.mjs";

const absolutePath = resolveMt01c2b2ManifestPath();
const { prisma, identity } = await createMt01c2b2LocalPrisma();
try {
  const plan = await planMt01c2b2(prisma);
  let envelope;
  if (existsSync(absolutePath)) {
    envelope = readMt01c2b2Envelope(absolutePath);
    if (envelope.manifest?.manifestHash !== plan.manifest.manifestHash) throw new Error("MT01C2B2_EXISTING_MANIFEST_MISMATCH");
  } else {
    envelope = { phase: "PENDING", createdAt: new Date().toISOString(), manifest: plan.manifest };
    writeMt01c2b2EnvelopeAtomic(absolutePath, envelope, { exclusive: true });
  }
  const result = await applyMt01c2b2(prisma, envelope.manifest);
  if (result.manifest.manifestHash !== envelope.manifest.manifestHash) throw new Error("MT01C2B2_APPLIED_MANIFEST_MISMATCH");
  writeMt01c2b2EnvelopeAtomic(absolutePath, { ...envelope, phase: "APPLIED", appliedAt: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify({ ok: true, target: identity, batchId: result.batchId, manifestHash: result.manifest.manifestHash, changed: result.changed, final: result.final }, null, 2)}\n`);
} finally { await prisma.$disconnect(); }
