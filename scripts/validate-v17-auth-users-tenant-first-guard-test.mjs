import fs from "node:fs";
import path from "node:path";
import { validateV17AuthUsersTenantFirstRepository, validateV17AuthUsersTenantFirstSources } from "./validate-v17-auth-users-tenant-first-guard.mjs";

const root = process.cwd();
const files = [
  "api/_lib/authContext.js", "api/auth/login.js", "api/auth/me.js", "api/users/index.js",
  "api/_lib/adminMembershipDomain.js", "src/admin-tenant/adminApi.ts", "src/App.tsx",
  "src/components/auth/LoginScreen.tsx", "src/lib/sessionStore.ts", "prisma/schema.prisma",
  "src/lib/api.ts", "src/crm-relational/api.ts", "src/crm-relational/readApi.ts", "src/crm-relational/mutationApi.ts",
];
const sources = new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const results = [];
function accepted(name, operation) { operation(); results.push({ name, passed: true }); }
function rejected(name, mutate) {
  const changed = new Map(sources); mutate(changed);
  try { validateV17AuthUsersTenantFirstSources(changed); throw new Error(`guardia aceptó: ${name}`); }
  catch (error) { if (!String(error.message).includes("V17-AUTH-USERS-TENANT-FIRST")) throw error; results.push({ name, passed: true }); }
}

accepted("repositorio actual", () => validateV17AuthUsersTenantFirstRepository(root));
rejected("selección sin validación UUID", (m) => m.set("api/_lib/authContext.js", m.get("api/_lib/authContext.js").replace("UUID_V4.test(value)", "true")));
rejected("selección sin vínculo al User", (m) => m.set("api/_lib/authContext.js", m.get("api/_lib/authContext.js").replace('WHERE u."id" = ${String(payload.sub)}', "WHERE TRUE")));
rejected("default vuelve a seleccionar silenciosamente", (m) => m.set("api/_lib/authContext.js", m.get("api/_lib/authContext.js").replace("activeCandidates.length === 1 ? activeCandidates[0] : null", "activeCandidates[0] || null")));
rejected("Membership inactiva aceptada", (m) => m.set("api/_lib/authContext.js", m.get("api/_lib/authContext.js").replace("if (!active(selected.membership_status))", "if (false)")));
rejected("Tenant inactivo aceptado", (m) => m.set("api/_lib/authContext.js", m.get("api/_lib/authContext.js").replace("if (!active(selected.tenant_status))", "if (false)")));
rejected("login vuelve a exponer User id", (m) => m.set("api/auth/login.js", m.get("api/auth/login.js").replace("user: {\n      name", "user: {\n      id: user.id,\n      name")));
rejected("/api/users vuelve a listar global", (m) => m.set("api/users/index.js", `${m.get("api/users/index.js")}\nprisma.user.findMany({});`));
rejected("/api/users vuelve a aceptar password", (m) => m.set("api/users/index.js", `${m.get("api/users/index.js")}\nconst password = body.password;`));
rejected("cliente central vuelve a listar User", (m) => m.set("src/lib/api.ts", `${m.get("src/lib/api.ts")}\nexport const getUsers = () => requestJson('/users');`));
rejected("admin omite tenant", (m) => m.set("api/_lib/adminMembershipDomain.js", m.get("api/_lib/adminMembershipDomain.js").replaceAll('tm."tenant_id"=${actor.tenantId}', 'TRUE')));
rejected("DTO admin expone userId", (m) => m.set("src/admin-tenant/adminApi.ts", m.get("src/admin-tenant/adminApi.ts").replace("membershipRef: string;", "membershipRef: string;\n  userId: string;")));
rejected("selector usa tenantId", (m) => m.set("src/components/auth/LoginScreen.tsx", `${m.get("src/components/auth/LoginScreen.tsx")}\nconst tenantId = 'client-authority';`));
rejected("cambio no limpia storage", (m) => m.set("src/lib/sessionStore.ts", m.get("src/lib/sessionStore.ts").replace("sessionStorage.clear();", "")));
rejected("User obtiene publicRef", (m) => m.set("prisma/schema.prisma", m.get("prisma/schema.prisma").replace("model User {", "model User {\n  publicRef String")));
rejected("User.role vuelve al DTO de login", (m) => m.set("api/auth/login.js", m.get("api/auth/login.js").replace("name: user.name,", "name: user.name, role: user.role,")));
rejected("cliente CRM omite membershipRef", (m) => m.set("src/crm-relational/readApi.ts", m.get("src/crm-relational/readApi.ts").replaceAll('"X-OSI-Membership-Ref"', '"X-Removed-Ref"')));

process.stdout.write(`${JSON.stringify({ ok: true, passed: results.length, results }, null, 2)}\n`);
