const EXPECTED_BRANCH = "test/mt01b2b-hybrid-preview";

function describe(name, { url = false } = {}) {
  const raw = process.env[name];
  const present = typeof raw === "string";
  const value = present ? raw : "";
  const trimmed = value.trim();
  return {
    present,
    rawLength: value.length,
    trimmedLength: trimmed.length,
    firstCodePoint: value.length ? value.codePointAt(0) : null,
    lastCodePoint: value.length ? value.codePointAt(value.length - 1) : null,
    hasBom: value.startsWith("\uFEFF"),
    hasWhitespace: value !== trimmed,
    ...(url ? { startsWithPostgresql: /^postgres(?:ql)?:\/\//.test(value) } : {}),
  };
}

export default function handler(req, res) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return res.status(404).json({ ok: false });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false });
  }
  return res.status(200).json({
    ok: true,
    environment: "preview",
    branchMatches: true,
    variables: {
      DATABASE_URL: describe("DATABASE_URL", { url: true }),
      DIRECT_URL: describe("DIRECT_URL", { url: true }),
      JWT_SECRET: describe("JWT_SECRET"),
      MT01B_REFRESH_TOKEN_PEPPER: describe("MT01B_REFRESH_TOKEN_PEPPER"),
      MT01B_ALLOWED_ORIGINS: describe("MT01B_ALLOWED_ORIGINS"),
    },
  });
}
