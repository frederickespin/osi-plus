import { prisma } from "../_lib/db.js";
import { getBearerToken, verifyAccessToken } from "../_lib/auth.js";
import { MT01B_AUTH_MODES, resolveMt01bAuthPolicy } from "../_lib/authPolicy.js";
import { methodNotAllowed, unauthorized, withCommonHeaders } from "../_lib/http.js";
import { withLegacyAuthHeaders } from "../_lib/authHttp.js";
import { requireAuthContext } from "../_lib/authContextMiddleware.js";
import { isGloballyActiveUser } from "../_lib/userStatus.js";
import { sendCommercialTenancyError } from "../_lib/commercialTenancyWrite.js";
import {
  requireV17CommercialCrmPreviewSessionMode,
  resolveV17CommercialCrmPreviewSessionContext,
} from "../_lib/v17CommercialCrmPreviewAuth.js";
import {
  requireV17CommercialCrmProductionSessionMode,
  resolveV17CommercialCrmProductionSessionContext,
} from "../_lib/v17CommercialCrmProductionAuth.js";

function legacyUserDto(user, authorization = null, commercialAuthority = null) {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: authorization?.role ?? user.role,
    status: user.status,
    department: user.department,
    joinDate: user.joinDate,
    points: user.points,
    rating: user.rating,
    ...(authorization ? {
      permissions: authorization.effectivePermissions,
      deniedPermissions: authorization.deniedPermissions,
      ...(commercialAuthority === "PREVIEW_REHEARSAL" ? { commercialCrmPreviewAuthorized: true } : {}),
      ...(commercialAuthority === "PRODUCTION_READ" ? { commercialCrmProductionAuthorized: true } : {}),
    } : {}),
  };
}

async function findCurrentUser(userId) {
  try {
    return { user: await prisma.user.findUnique({ where: { id: userId } }), unavailable: false };
  } catch {
    return { user: null, unavailable: true };
  }
}

function databaseUnavailable(res) {
  return res.status(503).json({ ok: false, error: "AUTH_DATABASE_UNAVAILABLE" });
}

const legacyMeHandler = withCommonHeaders(async (req, res) => {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  let previewRequested;
  let productionRequested;
  try {
    previewRequested = requireV17CommercialCrmPreviewSessionMode(process.env);
    productionRequested = requireV17CommercialCrmProductionSessionMode(process.env);
  } catch (error) {
    return sendCommercialTenancyError(res, error);
  }

  const policy = resolveMt01bAuthPolicy();
  if (policy.mode === MT01B_AUTH_MODES.LEGACY) {
    const token = getBearerToken(req);
    if (!token) return unauthorized(res);
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return unauthorized(res);
    }
    const lookup = await findCurrentUser(payload.sub);
    if (lookup.unavailable) return databaseUnavailable(res);
    const legacyUser = lookup.user;
    if (!legacyUser || !isGloballyActiveUser(legacyUser.status)) return unauthorized(res);
    if (previewRequested) {
      try {
        const context = await resolveV17CommercialCrmPreviewSessionContext(req, { env: process.env, prisma });
        return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser, context, "PREVIEW_REHEARSAL") });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    if (productionRequested) {
      try {
        const context = await resolveV17CommercialCrmProductionSessionContext(req, { env: process.env, prisma });
        return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser, context, "PRODUCTION_READ") });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser) });
  }

  const context = await requireAuthContext(req, res, { prisma });
  if (!context) return;

  if (context.authType === "LEGACY") {
    const lookup = await findCurrentUser(context.userId);
    if (lookup.unavailable) return databaseUnavailable(res);
    const user = lookup.user;
    if (!user || !isGloballyActiveUser(user.status)) return unauthorized(res);
    const legacyUser = legacyUserDto(user);
    return res.status(200).json({ ok: true, user: legacyUser });
  }

  return res.status(200).json({
    ok: true,
    auth: {
      authVersion: context.authVersion,
      userId: context.userId,
      email: context.email,
      tenantId: context.tenantId,
      tenantCode: context.tenantCode,
      membershipId: context.membershipId,
      role: context.role,
      authorizationVersion: context.authorizationVersion,
      permissions: context.effectivePermissions,
      sessionId: context.sessionId,
    },
  });
}, { handleOptions: false, cors: false });

export default withLegacyAuthHeaders(legacyMeHandler, { methods: ["GET"] });

