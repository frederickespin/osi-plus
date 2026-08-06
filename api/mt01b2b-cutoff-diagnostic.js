const EXPECTED_BRANCH = "test/mt01b2b-hybrid-preview";
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export default function handler(req, res) {
  const environment = process.env.VERCEL_ENV;
  const commitRef = process.env.VERCEL_GIT_COMMIT_REF;

  if (environment !== "preview" || commitRef !== EXPECTED_BRANCH) {
    return res.status(404).json({ ok: false });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, allowed: ["GET"] });
  }

  const raw = process.env.MT01B_LEGACY_TOKEN_ACCEPT_UNTIL;
  const present = typeof raw === "string" && raw.length > 0;
  const trimmed = present ? raw.trim() : "";
  const parsedAt = present ? Date.parse(raw) : Number.NaN;
  const parseable = Number.isFinite(parsedAt);
  const now = Date.now();
  const deltaMs = parseable ? parsedAt - now : Number.NaN;
  const first = present ? raw[0] : "";
  const last = present ? raw[raw.length - 1] : "";

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    cutoffPresent: present,
    rawLength: present ? raw.length : 0,
    trimmedLength: trimmed.length,
    hasOuterQuotes: present && ((first === '"' && last === '"') || (first === "'" && last === "'")),
    hasWhitespace: present && /\s/.test(raw),
    parseable,
    canonicalFormat: parseable && raw === new Date(parsedAt).toISOString(),
    future: parseable && deltaMs > 0,
    withinSevenDays: parseable && deltaMs > 0 && deltaMs <= MAX_WINDOW_MS,
    deltaSeconds: parseable ? Math.trunc(deltaMs / 1_000) : null,
    vercelEnvironment: environment,
    commitRef,
  });
}
