import { readFileSync } from "node:fs";
import {
  assertNoBrowserCommercialAuthority,
  COMMERCIAL_TENANCY_ACTIVATION_BATCH,
  resolveCommercialTenancyModes,
} from "../api/_lib/commercialTenancyWrite.js";

const results = [];
function check(name, passed) {
  results.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error(name);
}
function allowed(name, env, expectedTenant = false) {
  let result;
  try { result = resolveCommercialTenancyModes(env); } catch { result = null; }
  check(name, result?.tenantMode === expectedTenant);
}
function rejected(name, env) {
  let error;
  try { resolveCommercialTenancyModes(env); } catch (caught) { error = caught; }
  check(name, error?.status === 503
    && error?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID"
    && !JSON.stringify(error).includes(COMMERCIAL_TENANCY_ACTIVATION_BATCH));
}

function response() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

const tenant = {
  COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE",
  COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ",
};
const production = {
  ...tenant,
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: "main",
  COMMERCIAL_TENANCY_ACTIVATION_BATCH,
};

try {
  allowed("variables ausentes conservan LEGACY_ONLY", {}, false);
  allowed("par LEGACY_ONLY exacto permitido", {
    COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY",
    COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY",
  }, false);
  rejected("batch presente con par LEGACY_ONLY rechazado", {
    COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY",
    COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY",
    COMMERCIAL_TENANCY_ACTIVATION_BATCH,
  });
  rejected("batch presente con modos ausentes rechazado", { COMMERCIAL_TENANCY_ACTIVATION_BATCH });
  rejected("WRITE tenant y READ legacy rechazados", { ...tenant, COMMERCIAL_TENANCY_READ_MODE: "LEGACY_ONLY" });
  rejected("READ tenant y WRITE legacy rechazados", { ...tenant, COMMERCIAL_TENANCY_WRITE_MODE: "LEGACY_ONLY" });
  rejected("WRITE tenant con READ ausente rechazado", { COMMERCIAL_TENANCY_WRITE_MODE: "TENANT_WRITE", COMMERCIAL_TENANCY_ACTIVATION_BATCH });
  rejected("READ tenant con WRITE ausente rechazado", { COMMERCIAL_TENANCY_READ_MODE: "TENANT_READ", COMMERCIAL_TENANCY_ACTIVATION_BATCH });
  rejected("par tenant sin batch rechazado también localmente", tenant);
  rejected("par tenant sin batch rechazado en Production", { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: undefined });
  rejected("batch incorrecto rechazado", { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: "MT-01C2B2-IPACKERS-DO-V2" });
  for (const [label, value] of [
    ["BOM", `\uFEFF${COMMERCIAL_TENANCY_ACTIVATION_BATCH}`],
    ["espacio inicial", ` ${COMMERCIAL_TENANCY_ACTIVATION_BATCH}`],
    ["espacio final", `${COMMERCIAL_TENANCY_ACTIVATION_BATCH} `],
    ["comillas", `"${COMMERCIAL_TENANCY_ACTIVATION_BATCH}"`],
    ["salto", `${COMMERCIAL_TENANCY_ACTIVATION_BATCH}\n`],
    ["casing", COMMERCIAL_TENANCY_ACTIVATION_BATCH.toLowerCase()],
  ]) rejected(`batch con ${label} rechazado`, { ...production, COMMERCIAL_TENANCY_ACTIVATION_BATCH: value });
  rejected("Preview permanece bloqueado", { ...production, VERCEL_ENV: "preview" });
  rejected("Production sin Git ref permanece bloqueado", { ...production, VERCEL_GIT_COMMIT_REF: undefined });
  rejected("Production en rama distinta de main rechazado", { ...production, VERCEL_GIT_COMMIT_REF: "feature/test" });
  rejected("casing alternativo de Production rechazado", { ...production, VERCEL_ENV: "Production" });
  allowed("Production main con batch exacto permite el par tenant", production, true);
  allowed("desarrollo local conserva el mecanismo de ensayo con lote", {
    ...tenant,
    VERCEL_ENV: "development",
    COMMERCIAL_TENANCY_ACTIVATION_BATCH,
  }, true);
  rejected("valor WRITE desconocido rechazado", { ...production, COMMERCIAL_TENANCY_WRITE_MODE: "FUTURE" });
  rejected("valor READ desconocido rechazado", { ...production, COMMERCIAL_TENANCY_READ_MODE: "FUTURE" });
  rejected("runtime Vercel sin ambiente inequívoco rechazado", { ...tenant, VERCEL: "1", COMMERCIAL_TENANCY_ACTIVATION_BATCH });

  let browserAuthority;
  try { assertNoBrowserCommercialAuthority({ tenantId: "forged", role: "A" }); } catch (error) { browserAuthority = error; }
  check("body no puede seleccionar tenant o rol", browserAuthority?.code === "COMMERCIAL_AUTHORITY_FIELDS_FORBIDDEN");
  const headersIgnored = resolveCommercialTenancyModes({ ...production, "x-osi-role": "A", "x-osi-userid": "forged" });
  check("headers no participan en la activación", headersIgnored.tenantMode === true && !Object.hasOwn(headersIgnored, "tenantId"));

  const source = readFileSync(new URL("../api/_lib/commercialTenancyWrite.js", import.meta.url), "utf8");
  const v2Start = source.indexOf('if (verifiedTokenKind === "V2"');
  const v2Branch = source.slice(v2Start, source.indexOf("return resolveLegacyCommercialContext", v2Start));
  check("JWT V2 candidato no degrada a LEGACY", v2Start >= 0 && /return resolveV2CommercialContext/.test(v2Branch) && !/catch/.test(v2Branch));
  check("resultado no expone activation batch", !JSON.stringify(resolveCommercialTenancyModes(production)).includes(COMMERCIAL_TENANCY_ACTIVATION_BATCH));

  const changingEnvironment = { ...production };
  check("primera request tenant usa configuración vigente", resolveCommercialTenancyModes(changingEnvironment).tenantMode === true);
  changingEnvironment.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
  let changedError;
  try { resolveCommercialTenancyModes(changingEnvironment); } catch (error) { changedError = error; }
  check("cambio inválido entre requests no usa caché global", changedError?.code === "COMMERCIAL_TENANCY_CONFIGURATION_INVALID");
  delete changingEnvironment.COMMERCIAL_TENANCY_ACTIVATION_BATCH;
  changingEnvironment.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
  check("request posterior recupera LEGACY sin estado obsoleto", resolveCommercialTenancyModes(changingEnvironment).tenantMode === false);

  const routeDefinitions = [
    ["../api/clients/index.js", "GET"],
    ["../api/clients/index.js", "POST"],
    ["../api/projects/index.js", "GET"],
    ["../api/projects/index.js", "POST"],
    ["../api/k/dashboard.js", "GET"],
    ["../api/k/project.js", "GET"],
    ["../api/k/project-validate.js", "POST"],
    ["../api/k/project-release.js", "POST"],
  ];
  const [{ prisma }, ...routeModules] = await Promise.all([
    import("../api/_lib/db.js"),
    ...routeDefinitions.map(([path]) => import(path)),
  ]);
  const originalQueryRaw = prisma.$queryRaw;
  const originalClientFindMany = prisma.client.findMany;
  const originalClientCreate = prisma.client.create;
  const originalProjectFindMany = prisma.project.findMany;
  const originalProjectFindUnique = prisma.project.findUnique;
  const originalProjectCreate = prisma.project.create;
  const originalProjectUpdate = prisma.project.update;
  let databaseTouches = 0;
  const touched = async () => { databaseTouches += 1; throw new Error("database must not be touched"); };
  prisma.$queryRaw = touched;
  prisma.client.findMany = touched;
  prisma.client.create = touched;
  prisma.project.findMany = touched;
  prisma.project.findUnique = touched;
  prisma.project.create = touched;
  prisma.project.update = touched;
  const previous = Object.fromEntries([
    "COMMERCIAL_TENANCY_WRITE_MODE",
    "COMMERCIAL_TENANCY_READ_MODE",
    "COMMERCIAL_TENANCY_ACTIVATION_BATCH",
    "VERCEL_ENV",
    "VERCEL_GIT_COMMIT_REF",
  ].map((name) => [name, process.env[name]]));
  try {
    process.env.COMMERCIAL_TENANCY_WRITE_MODE = "LEGACY_ONLY";
    process.env.COMMERCIAL_TENANCY_READ_MODE = "LEGACY_ONLY";
    process.env.COMMERCIAL_TENANCY_ACTIVATION_BATCH = COMMERCIAL_TENANCY_ACTIVATION_BATCH;
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    const attempts = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const [path, method] = routeDefinitions[index % routeDefinitions.length];
      const handler = routeModules[index % routeModules.length].default;
      const res = response();
      await handler({ method, headers: {}, query: {}, body: {} }, res);
      return { path, res };
    }));
    check("20 requests concurrentes inválidas devuelven 503", attempts.every(({ res }) => res.statusCode === 503
      && JSON.stringify(res.body) === JSON.stringify({ ok: false, error: "COMMERCIAL_TENANCY_CONFIGURATION_INVALID" })));
    check("configuración inválida produce cero lecturas o escrituras", databaseTouches === 0, { databaseTouches });
    check("errores concurrentes no exponen batch ni ambiente", attempts.every(({ res }) => {
      const serialized = JSON.stringify({ body: res.body, headers: [...res.headers?.entries?.() || []] });
      return !serialized.includes(COMMERCIAL_TENANCY_ACTIVATION_BATCH) && !serialized.includes("production");
    }));
  } finally {
    prisma.$queryRaw = originalQueryRaw;
    prisma.client.findMany = originalClientFindMany;
    prisma.client.create = originalClientCreate;
    prisma.project.findMany = originalProjectFindMany;
    prisma.project.findUnique = originalProjectFindUnique;
    prisma.project.create = originalProjectCreate;
    prisma.project.update = originalProjectUpdate;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  for (const [path] of routeDefinitions) {
    const routeSource = readFileSync(new URL(path, import.meta.url), "utf8");
    const handlerSource = routeSource.slice(routeSource.indexOf("export default"));
    const resolverAt = handlerSource.indexOf("resolveCommercialTenancyModes()");
    const businessPositions = ["requireCommercialPermission(", "requirePilotAuth(", "requirePilotPermission(", "requireRoleFromHeaders(", "prisma.client.", "prisma.project.", "readJson"]
      .map((needle) => handlerSource.indexOf(needle)).filter((position) => position >= 0);
    check(`${path} usa resolver antes de autoridad o datos`, resolverAt >= 0 && businessPositions.every((position) => resolverAt < position));
    check(`${path} no interpreta variables comerciales directamente`, !/process\.env\.COMMERCIAL_TENANCY_/.test(routeSource));
  }

  process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, effectiveDefaults: { write: "LEGACY_ONLY", read: "LEGACY_ONLY" }, results }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, assertions: results.filter((item) => item.passed).length, error: error.message, results }, null, 2)}\n`);
  process.exitCode = 1;
}
