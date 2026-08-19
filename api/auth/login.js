import { prisma } from "../_lib/db.js";
import { comparePassword, signAccessToken } from "../_lib/auth.js";
import { methodNotAllowed, readJsonObject, withCommonHeaders } from "../_lib/http.js";
import { withLegacyAuthHeaders } from "../_lib/authHttp.js";
import { isGloballyActiveUser } from "../_lib/userStatus.js";

// Hash fijo y no sensible: obliga una comparación bcrypt aunque la identidad
// no exista, evitando la bifurcación evidente de retorno antes de bcrypt.
const UNKNOWN_IDENTITY_PASSWORD_HASH = "$2b$10$KeUIafxBZD3Q2njsJa29s.bgqdTB8KTUI3fQ8PSxS/ajnC2Qm9S9S";

export async function authenticateLegacyCredentials({ email, password, prismaClient = prisma, compare = comparePassword }) {
  let user;
  try {
    user = await prismaClient.user.findUnique({ where: { email } });
  } catch {
    return { outcome: "DATABASE_UNAVAILABLE", user: null };
  }

  const isValid = await compare(password, user?.passwordHash || UNKNOWN_IDENTITY_PASSWORD_HASH);
  if (!user || !isValid || !isGloballyActiveUser(user.status)) {
    return { outcome: "INVALID", user: null };
  }
  return { outcome: "AUTHENTICATED", user };
}

const legacyLoginHandler = withCommonHeaders(async (req, res) => {
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
  if (typeof body.email !== "string" || typeof body.password !== "string") {
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

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return res.status(200).json({
    ok: true,
    token,
    user: {
      id: user.id,
      code: user.code,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      department: user.department,
      joinDate: user.joinDate,
      points: user.points,
      rating: user.rating,
    },
  });
}, { handleOptions: false, cors: false });

export default withLegacyAuthHeaders(legacyLoginHandler, { methods: ["POST"] });

