import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROUTES = Object.freeze([
  "api/clients/index.js",
  "api/projects/index.js",
  "api/k/project-validate.js",
  "api/k/project-release.js",
]);

function source(root, relative, overrides) {
  return overrides?.get(relative) ?? fs.readFileSync(path.join(root, relative), "utf8");
}

export function validateCommercialTenancyMutationGuard({ root = process.cwd(), overrides } = {}) {
  const gate = source(root, "api/_lib/commercialTenancyMutation.js", overrides);
  assert.match(gate, /DISABLED:\s*"DISABLED"[\s\S]*LOCAL_ONLY:\s*"LOCAL_ONLY"/u, "modos exactos ausentes");
  assert.doesNotMatch(gate, /PREVIEW_WRITE|PRODUCTION_WRITE/u, "la compuerta amplió modos de escritura");
  assert.match(gate, /Object\.keys\(env \|\| \{\}\)[\s\S]*startsWith\("VERCEL"\)/u, "LOCAL_ONLY no rechaza todos los marcadores Vercel");
  assert.match(gate, /if \(hasVercelMarker\(env\)\) \{/u, "el rechazo Vercel no domina LOCAL_ONLY");
  assert.match(gate, /request\?\.socket\?\.localAddress[\s\S]*request\?\.socket\?\.remoteAddress/u, "loopback no procede del socket real");
  assert.doesNotMatch(gate, /x-forwarded|headers\?\.|headers\[/iu, "headers falsificables participan en la autoridad local");
  assert.match(gate, /COMMERCIAL_TENANCY_MUTATIONS_DISABLED[\s\S]*status\(409\)/u, "respuesta estable 409 ausente");
  assert.match(gate, /private, no-store/u, "caché privada ausente");
  assert.match(gate, /Authorization[\s\S]*Origin/u, "Vary privado incompleto");

  for (const relative of ROUTES) {
    const route = source(root, relative, overrides);
    assert.match(route, /from "\.\.\/_lib\/commercialTenancyMutation\.js"|from "\.\.\/\.\.\/_lib\/commercialTenancyMutation\.js"/u, `${relative}: import canónico ausente`);
    const handler = route.slice(route.indexOf("export default"));
    const gateAt = handler.indexOf("requireCommercialTenancyMutation(");
    assert.ok(gateAt >= 0, `${relative}: compuerta ausente`);
    for (const marker of ["resolveCommercialTenancyModes(", "requireCommercialPermission(", "requirePilotAuth(", "requirePilotPermission(", "requireRoleFromHeaders(", "readJson", "prisma.client.", "prisma.project."]) {
      const markerAt = handler.indexOf(marker);
      if (markerAt >= 0) assert.ok(gateAt < markerAt, `${relative}: ${marker} ocurre antes de la compuerta`);
    }
  }

  const envExample = source(root, ".env.example", overrides);
  assert.match(envExample, /^COMMERCIAL_TENANCY_MUTATION_MODE="DISABLED"$/mu, "default versionado no está DISABLED");
  const workflow = source(root, ".github/workflows/ci.yml", overrides);
  assert.match(workflow, /npm run test:commercial-tenancy-mutation-gate/u, "prueba de compuerta no es obligatoria en CI");
  assert.match(workflow, /npm run guard:commercial-tenancy-mutation-gate/u, "guardia de compuerta no es obligatoria en CI");
  return { routes: ROUTES.length, modes: 2 };
}

if (import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...validateCommercialTenancyMutationGuard() })}\n`);
}
