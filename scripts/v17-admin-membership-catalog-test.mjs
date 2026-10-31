import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminMembershipCatalog } from "../api/_lib/adminMembershipDomain.js";
import { PERMS, effectivePermissionsFor, permsForRole } from "../api/_lib/rbac.js";
import { ADMIN_MEMBERSHIP_ROLE_OPTIONS, isAdminMembershipRole } from "../shared/adminMembershipCatalog.js";

const results = [];
function check(name, run) {
  run();
  results.push({ name, passed: true });
}

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const enumSource = schema.match(/enum TenantMembershipRole\s*\{([^}]+)\}/u)?.[1];
assert.ok(enumSource, "TenantMembershipRole must exist in the canonical schema");
const schemaRoles = enumSource.split(/\s+/u).filter(Boolean);
const catalog = adminMembershipCatalog();
const knownPermissions = [...new Set(Object.values(PERMS))].sort();

check("roles asignables coinciden exactamente con el enum de membresías", () => {
  assert.deepEqual(ADMIN_MEMBERSHIP_ROLE_OPTIONS.map((role) => role.code), schemaRoles);
  assert.deepEqual(catalog.roles.map((role) => role.code), schemaRoles);
  assert.equal(new Set(catalog.roles.map((role) => role.code)).size, schemaRoles.length);
  for (const role of schemaRoles) assert.equal(isAdminMembershipRole(role), true);
  for (const invalid of ["RB", "a", " A", "A ", "OWNER", "", null]) assert.equal(isAdminMembershipRole(invalid), false);
});

check("catálogo público contiene sólo los campos de presentación", () => {
  assert.deepEqual(Object.keys(catalog).sort(), ["permissions", "roles"]);
  for (const role of catalog.roles) assert.deepEqual(Object.keys(role).sort(), ["code", "inheritedPermissions", "label"]);
  for (const permission of catalog.permissions) assert.deepEqual(Object.keys(permission).sort(), ["code", "group", "label"]);
});

check("permisos conocidos completos sin duplicados y con etiquetas legibles", () => {
  assert.deepEqual(catalog.permissions.map((permission) => permission.code), knownPermissions);
  const untranslated = catalog.permissions.filter((permission) => permission.label === permission.code).map((permission) => permission.code);
  assert.deepEqual(untranslated, [], "Known permissions need human-readable labels");
  for (const permission of catalog.permissions) {
    assert.ok(permission.label.trim() && permission.label.length <= 200);
    assert.ok(permission.group.trim() && permission.group.length <= 100);
  }
});

for (const role of catalog.roles) {
  check(`herencia ${role.code} procede del RBAC canónico del servidor`, () => {
    assert.deepEqual(role.inheritedPermissions, [...new Set(permsForRole(role.code))].sort());
    assert.ok(role.label.trim());
    assert.ok(role.inheritedPermissions.every((permission) => knownPermissions.includes(permission)));
  });
}

check("Administrador no hereda las capacidades que exigen concesión explícita", () => {
  const inherited = catalog.roles.find((role) => role.code === "A").inheritedPermissions;
  for (const permission of [
    "membership:view", "membership:update:role", "membership:update:permissions", "membership:update:status",
    "services:catalog:manage", "survey:publish", "inventory:stock:adjust", "assets:instance:manage",
    "logistics:rules:manage", "costing:rules:manage", "quote:publish", "communications:send",
    "personnel:profiles:manage", "client-access:manage",
    "fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize",
  ]) assert.equal(inherited.includes(permission), false, `${permission} requires an explicit grant`);
});

check("denegar prevalece sobre rol y concesión adicional", () => {
  const inherited = catalog.roles.find((role) => role.code === "V").inheritedPermissions;
  assert.ok(inherited.includes("pipeline:view"));
  assert.ok(!inherited.includes("logistics:rules:view"));
  const effective = effectivePermissionsFor("V", ["pipeline:view", "logistics:rules:view"], ["pipeline:view"]);
  assert.equal(effective.includes("pipeline:view"), false);
  assert.equal(effective.includes("logistics:rules:view"), true);
});

check("autoridad de choferes requiere designación explícita en cualquier rol", () => {
  for (const role of catalog.roles) {
    for (const permission of ["fleet:drivers:assign", "fleet:drivers:request", "fleet:drivers:authorize"]) {
      assert.equal(role.inheritedPermissions.includes(permission), false, `${role.code} must not inherit ${permission}`);
      assert.equal(effectivePermissionsFor(role.code, [permission]).includes(permission), true);
      assert.equal(effectivePermissionsFor(role.code, [permission], [permission]).includes(permission), false);
    }
  }
  assert.equal(catalog.permissions.find(({ code }) => code === "fleet:drivers:authorize").label,
    "Responsable de Flota/Logística: autorizar choferes temporales");
});

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, roles: catalog.roles.length, permissions: catalog.permissions.length, results }, null, 2)}\n`);
