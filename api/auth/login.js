import { prisma } from "../_lib/db.js";
import { comparePassword, signAccessToken } from "../_lib/auth.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "../_lib/http.js";
import { withLegacyAuthHeaders } from "../_lib/authHttp.js";
import { isGloballyActiveUser } from "../_lib/userStatus.js";
import { listLegacyMembershipOptions } from "../_lib/authContext.js";
import { Mt01bAuthError } from "../_lib/authPolicy.js";

// Hash fijo y no sensible: obliga una comparación bcrypt aunque la identidad
// no exista, evitando la bifurcación evidente de retorno antes de bcrypt.
const UNKNOWN_IDENTITY_PASSWORD_HASH = "$2b$10$KeUIafxBZD3Q2njsJa29s.bgqdTB8KTUI3fQ8PSxS/ajnC2Qm9S9S";

export async function authenticateLegacyCredentials({ email, password, prismaClient = prisma, compare = comparePassword }) {
  let user;
  try {
    const where = { OR: [{ normalizedEmail: email }, { email: { equals: email, mode: "insensitive" } }] };
    if (typeof prismaClient.user.findMany === "function") {
      const matches = await prismaClient.user.findMany({ where, take: 2, orderBy: { id: "asc" } });
      user = matches.length === 1 ? matches[0] : null;
    } else if (typeof prismaClient.user.findFirst === "function") {
      user = await prismaClient.user.findFirst({ where });
    } else {
      user = await prismaClient.user.findUnique({ where: { email } });
    }
  } catch {
    return { outcome: "DATABASE_UNAVAILABLE", user: null };
  }

  const isValid = await compare(password, user?.passwordHash || UNKNOWN_IDENTITY_PASSWORD_HASH);
  if (!user || !isValid || !isGloballyActiveUser(user.status)) {
    return { outcome: "INVALID", user: null };
  }
  return { outcome: "AUTHENTICATED", user };
}

const legacyLoginHandler = withPrivateApiHeaders(async (req, res) => {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  const body = await readJsonObject(req, {
    maxBytes: 16 * 1024,
    requireNonEmptyObject: true,
  });
  if (Object.keys(body).some((key) => key !== "email" && key !== "password")) {
    return res.status(400).json({ ok: false, error: "Solicitud de autenticación inválida" });
  }
  if ((Object.hasOwn(body, "email") && typeof body.email !== "string")
    || (Object.hasOwn(body, "password") && typeof body.password !== "string")) {
    return res.status(400).json({ ok: false, error: "Solicitud de autenticación inválida" });
  }
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: "email y password son requeridos",
    });
  }

  const authentication = await authenticateLegacyCredentials({ email, password });
  if (authentication.outcome === "DATABASE_UNAVAILABLE") {
    return res.status(503).json({ ok: false, error: "AUTH_DATABASE_UNAVAILABLE" });
  }
  if (authentication.outcome !== "AUTHENTICATED") {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
  }
  const user = authentication.user;
  let memberships;
  try {
    memberships = await listLegacyMembershipOptions(prisma, user.id);
  } catch (error) {
    if (error instanceof Mt01bAuthError) {
      return res.status(error.status).json({ ok: false, error: error.code });
    }
    throw error;
  }
  if (memberships.length === 0) {
    return res.status(403).json({ ok: false, error: "MT01B_MEMBERSHIP_NOT_FOUND" });
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return res.status(200).json({
    ok: true,
    token,
    user: {
      name: user.name,
    },
    membershipSelection: {
      required: memberships.length > 1,
      options: memberships,
    },
  });
}, { handleOptions: false });

export default withLegacyAuthHeaders(legacyLoginHandler, { methods: ["POST"] });

