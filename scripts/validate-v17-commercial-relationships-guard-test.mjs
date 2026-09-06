import assert from "node:assert/strict";
import fs from "node:fs";
import { validateCommercialRelationshipsGuard } from "./validate-v17-commercial-relationships-guard.mjs";
const read = (file) => fs.readFileSync(file, "utf8"); const base = { "prisma/schema.prisma": read("prisma/schema.prisma"), "prisma/migrations/20260912010000_v17_commercial_relationships/migration.sql": read("prisma/migrations/20260912010000_v17_commercial_relationships/migration.sql"), "api/_lib/commercialRelationshipsContract.js": read("api/_lib/commercialRelationshipsContract.js"), "api/_lib/commercialRelationshipsDomain.js": read("api/_lib/commercialRelationshipsDomain.js"), "api/_lib/quoteDomain.js": read("api/_lib/quoteDomain.js"), "api/_lib/commercialRelationshipsHttp.js": read("api/_lib/commercialRelationshipsHttp.js"), "src/commercial-relationships/mode.ts": read("src/commercial-relationships/mode.ts"), "src/commercial-relationships/CaseCommercialContextPanel.tsx": read("src/commercial-relationships/CaseCommercialContextPanel.tsx"), "scripts/protected-cors-route-inventory.json": read("scripts/protected-cors-route-inventory.json") };
let passed = 0; function rejects(name, file, mutate) { assert.throws(() => validateCommercialRelationshipsGuard({ ...base, [file]: mutate(base[file]) }), undefined, name); passed += 1; }
rejects("tenant-first", "prisma/schema.prisma", (v) => v.replace("@@unique([tenantId, entityRef]", "@@unique([entityRef]"));
rejects("payer explícito", "api/_lib/commercialRelationshipsContract.js", (v) => v.replace("requirePublishedPayer", "inferPayerFromClient"));
rejects("Lead Account explícito", "api/_lib/commercialRelationshipsDomain.js", (v) => `${v}\nconst inferLeadAccount = true;`);
rejects("sin store legacy", "api/_lib/commercialRelationshipsDomain.js", (v) => `${v}\nconst useCasesStore = true;`);
rejects("sin storage empresarial", "src/commercial-relationships/CaseCommercialContextPanel.tsx", (v) => `${v}\nlocalStorage.setItem('payer','x');`);
rejects("tarifa versionada", "prisma/schema.prisma", (v) => v.replaceAll("@@unique([tenantId, seriesRef, version]", "@@unique([tenantId, seriesRef]"));
rejects("historial append-only", "prisma/migrations/20260912010000_v17_commercial_relationships/migration.sql", (v) => v.replaceAll("commercial_relationship_append_only", "mutable_history"));
rejects("asociación no hard-coded", "api/_lib/commercialRelationshipsDomain.js", (v) => `${v}\nconst association = 'FIDI';`);
rejects("producción apagada", "api/_lib/commercialRelationshipsHttp.js", (v) => v.replace("productionApiEnabled = false", "productionApiEnabled = true"));
rejects("Quote consume snapshot", "api/_lib/quoteDomain.js", (v) => v.replaceAll("resolveCommercialQuoteAuthority", "ignoreCommercialQuoteAuthority"));
rejects("CORS inventariado", "scripts/protected-cors-route-inventory.json", (v) => v.replace('      "/api/commercial-relationships/entities",\n', ""));
console.log(JSON.stringify({ ok: true, negativeCases: passed }));
