import { validateCrm01b2DatabaseIdentity, validateCrm01b2LocalUrl } from "./crm-01b2-local-target.mjs";

const results = [];
const check = (name, condition) => { results.push({ name, passed: Boolean(condition) }); if (!condition) throw new Error(name); };
const rejected = (name, value) => {
  let error;
  try { validateCrm01b2LocalUrl(value); } catch (caught) { error = caught; }
  check(name, /CRM01B2_LOCAL_TARGET_REJECTED/.test(error?.message || ""));
};
const local = ["postgresql://crm", "local-only@127.0.0.1:55432", "osi_crm01b2_local?schema=osi"].join(":").replace(":osi_", "/osi_");
const target = validateCrm01b2LocalUrl(local);
check("destino local exacto", target.host === "127.0.0.1" && target.port === 55432 && target.database === "osi_crm01b2_local");
rejected("variable ausente", null);
const externalSuffix = [".neon", ".tech"].join("");
rejected("Neon directo", local.replace("127.0.0.1:55432", `ep-example.us-east-2.aws${externalSuffix}:5432`));
rejected("Neon pooled", local.replace("127.0.0.1:55432", `ep-example-pooler.us-east-2.aws${externalSuffix}:5432`));
rejected("localhost ambiguo", local.replace("127.0.0.1", "localhost"));
rejected("puerto distinto", local.replace("55432", "5432"));
rejected("base no permitida", local.replace("osi_crm01b2_local", "postgres"));
rejected("schema distinto", local.replace("schema=osi", "schema=public"));
rejected("credenciales ausentes", "postgresql://127.0.0.1:55432/osi_crm01b2_local?schema=osi");
let identityError;
try { validateCrm01b2DatabaseIdentity({ database: target.database, schema: "osi", address: "127.0.0.1", port: 55432, neon_branch_id: "br-forbidden" }, target); } catch (error) { identityError = error; }
check("neon.branch_id posterior rechazado", /REJECTED/.test(identityError?.message || ""));
process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
