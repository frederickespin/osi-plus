import { randomUUID } from "node:crypto";
import { createV17CasePublicRefLocalPrisma } from "./v17-case-public-ref-local-target.mjs";

const results = [];
function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) throw new Error(name);
}
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function caseData(id, tenantId, overrides = {}) {
  return {
    id, tenantId, caseCode: id.toUpperCase(), clientName: "Synthetic", mode: "LOCAL",
    serviceType: "MOVING", customerType: "L4_PERSONAL", ownerName: "Unassigned",
    originLocation: "Synthetic origin", destinationLocation: "Synthetic destination", ...overrides,
  };
}
async function expectRejected(tx, name, operation) {
  const savepoint = `v17pr_${results.length}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  check(name, Boolean(error), error ? { code: error.code || "POSTGRES_REJECTED" } : undefined);
}

const { prisma, target } = await createV17CasePublicRefLocalPrisma();
const run = `v17pr-${Date.now()}`;
try {
  const [availability] = await prisma.$queryRawUnsafe(`SELECT to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL AS available`);
  check("gen_random_uuid disponible en pg_catalog", availability.available === true);

  await prisma.$transaction(async (tx) => {
    const tenantOne = await tx.tenant.create({ data: { id: `${run}-tenant-1`, code: `${run}-T1`.toUpperCase(), name: "Synthetic one" } });
    const tenantTwo = await tx.tenant.create({ data: { id: `${run}-tenant-2`, code: `${run}-T2`.toUpperCase(), name: "Synthetic two" } });
    const first = await tx.pipelineCase.create({ data: caseData(`${run}-case-1`, tenantOne.id) });
    const second = await tx.pipelineCase.create({ data: caseData(`${run}-case-2`, tenantOne.id) });
    check("PostgreSQL genera UUID v4 no nulo", uuidV4.test(first.publicRef) && uuidV4.test(second.publicRef));
    check("publicRef es independiente de id", first.publicRef !== first.id && !first.publicRef.includes(first.id) && !first.id.includes(first.publicRef));
    check("referencias sucesivas no forman secuencia", first.publicRef !== second.publicRef);

    const explicit = randomUUID();
    const explicitRow = await tx.pipelineCase.create({ data: { ...caseData(`${run}-case-explicit`, tenantOne.id), publicRef: explicit } });
    check("INSERT con UUID explícito válido permitido", explicitRow.publicRef === explicit);
    await tx.pipelineCase.create({ data: { ...caseData(`${run}-case-other-tenant`, tenantTwo.id), publicRef: explicit } });
    check("unicidad es tenant-first", true);
    await expectRejected(tx, "duplicado explícito dentro del tenant rechazado", () => tx.pipelineCase.create({ data: { ...caseData(`${run}-case-duplicate`, tenantOne.id), publicRef: explicit } }));

    const statusUpdate = await tx.pipelineCase.update({ where: { id: first.id }, data: { status: "AWAITING_ICP" } });
    check("UPDATE empresarial conserva referencia", statusUpdate.status === "AWAITING_ICP" && statusUpdate.publicRef === first.publicRef);
    const sameRef = await tx.pipelineCase.update({ where: { id: first.id }, data: { publicRef: first.publicRef } });
    check("UPDATE con referencia idéntica permitido", sameRef.publicRef === first.publicRef);
    await expectRejected(tx, "cambio de publicRef rechazado", () => tx.pipelineCase.update({ where: { id: first.id }, data: { publicRef: randomUUID() } }));
    await expectRejected(tx, "asignación NULL rechazada", () => tx.$executeRawUnsafe(`UPDATE "osi"."osi_pipeline_cases" SET "public_ref" = NULL WHERE "id" = $1`, first.id));

    const objects = await tx.$queryRawUnsafe(`
      SELECT
        (SELECT is_nullable FROM information_schema.columns WHERE table_schema='osi' AND table_name='osi_pipeline_cases' AND column_name='public_ref') AS nullable,
        (SELECT column_default FROM information_schema.columns WHERE table_schema='osi' AND table_name='osi_pipeline_cases' AND column_name='public_ref') AS default_value,
        (SELECT COUNT(*)::integer FROM pg_constraint WHERE connamespace='osi'::regnamespace AND conname='osi_pipeline_cases_tenant_id_public_ref_key') AS constraint_count,
        (SELECT COUNT(*)::integer FROM pg_trigger WHERE tgname='osi_pipeline_cases_public_ref_immutable_trg' AND NOT tgisinternal) AS trigger_count,
        (SELECT COUNT(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='osi' AND p.proname='osi_prevent_pipeline_case_public_ref_change') AS function_count
    `);
    check("columna NOT NULL con default PostgreSQL", objects[0].nullable === "NO" && /gen_random_uuid\(\)/.test(objects[0].default_value));
    check("constraint, función y trigger exactos presentes", objects[0].constraint_count === 1 && objects[0].trigger_count === 1 && objects[0].function_count === 1);
    throw new Error("V17_PUBLIC_REF_ROLLBACK");
  }, { maxWait: 5_000, timeout: 30_000 }).catch((error) => {
    if (error.message !== "V17_PUBLIC_REF_ROLLBACK") throw error;
  });

  check("fixtures focalizados revertidos", await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 0);

  const tenant = await prisma.tenant.create({ data: { id: `${run}-race-tenant`, code: `${run}-RACE`.toUpperCase(), name: "Synthetic race" } });
  const attempts = 200;
  const settled = await Promise.allSettled(Array.from({ length: attempts }, (_, index) => prisma.pipelineCase.create({
    data: caseData(`${run}-race-${String(index).padStart(3, "0")}`, tenant.id),
    select: { publicRef: true },
  })));
  const fulfilled = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value.publicRef);
  check("creación concurrente completa sin filas parciales", fulfilled.length === attempts && settled.every((entry) => entry.status === "fulfilled"));
  check("creación concurrente sin UUID duplicados", new Set(fulfilled).size === attempts);
  check("creación concurrente entrega UUID v4", fulfilled.every((value) => uuidV4.test(value)));
  await prisma.pipelineCase.deleteMany({ where: { id: { startsWith: `${run}-race-` } } });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  check("fixtures concurrentes eliminados", await prisma.pipelineCase.count({ where: { id: { startsWith: run } } }) === 0);

  process.stdout.write(`${JSON.stringify({ ok: true, target, assertions: results.length, concurrency: { attempts, created: fulfilled.length, duplicates: attempts - new Set(fulfilled).size, deadlocks: 0 }, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, target, assertions: results.length, error: { name: error.name, code: error.code || "V17_PUBLIC_REF_TEST_FAILED", message: error.message }, results }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
