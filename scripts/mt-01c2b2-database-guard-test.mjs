import { validateMt01c2b2LocalUrl } from "./mt-01c2b2-local-target.mjs";

const local = ["postgresql", "://", "synthetic", ":", "synthetic", "@127.0.0.1:55432/osi_mt01c2b2_local?schema=osi"].join("");
const results = [];

function check(name, condition) {
  if (!condition) throw new Error(`MT01C2B2_DATABASE_GUARD_FAILED: ${name}`);
  results.push({ name, passed: true });
}

function reject(name, value, expected) {
  let opened = false;
  try {
    validateMt01c2b2LocalUrl(value);
    opened = true;
  } catch (error) {
    check(name, opened === false && String(error.message).includes(expected));
    return;
  }
  throw new Error(`${name}: destino inseguro aceptado`);
}

reject("variable exclusiva ausente", "", "es obligatoria");
reject("URL inválida", "not-a-url", "URL inválida");
reject("protocolo no PostgreSQL", local.replace("postgresql:", "https:"), "protocolo no PostgreSQL");
reject("host externo", local.replace("127.0.0.1", "192.0.2.1"), "host debe ser exactamente");
reject("Neon directo", local.replace("127.0.0.1:55432", "ep-synthetic.us-east-2.aws.neon.tech:5432"), "host debe ser exactamente");
reject("Neon pooled", local.replace("127.0.0.1:55432", "ep-synthetic-pooler.us-east-2.aws.neon.tech:5432"), "host debe ser exactamente");
reject("localhost ambiguo", local.replace("127.0.0.1", "localhost"), "host debe ser exactamente");
reject("puerto diferente", local.replace("55432", "5432"), "puerto debe ser exactamente");
reject("base fuera de allowlist", local.replace("osi_mt01c2b2_local", "neondb"), "base fuera de la allowlist");
reject("schema diferente", local.replace("schema=osi", "schema=public"), "schema debe ser osi");
reject("credenciales ausentes", ["postgresql", "://127.0.0.1:55432/osi_mt01c2b2_local?schema=osi"].join(""), "credenciales locales incompletas");

const accepted = validateMt01c2b2LocalUrl(local);
check("destino local allowlisted", accepted.host === "127.0.0.1" && accepted.port === 55432 && accepted.database === "osi_mt01c2b2_local" && accepted.schema === "osi");
check("DATABASE_URL externa no es fallback", (() => {
  const previous = process.env.DATABASE_URL;
  delete process.env.MT01C2B2_TEST_DATABASE_URL;
  process.env.DATABASE_URL = ["postgresql", "://", "x", ":", "x", "@example.invalid:5432/prod?schema=osi"].join("");
  try { validateMt01c2b2LocalUrl(); return false; }
  catch (error) { return String(error.message).includes("es obligatoria"); }
  finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
})());
check("override prohibido", (() => {
  process.env.MT01C2B2_SKIP_GUARD = "true";
  try { validateMt01c2b2LocalUrl(local); return false; }
  catch (error) { return String(error.message).includes("override prohibido"); }
  finally { delete process.env.MT01C2B2_SKIP_GUARD; }
})());

process.stdout.write(`${JSON.stringify({ ok: true, assertions: results.length, results }, null, 2)}\n`);
