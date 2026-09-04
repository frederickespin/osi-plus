import { prisma } from "../_lib/db.js";
import { MT01B_AUTH_MODES, resolveMt01bAuthPolicy } from "../_lib/authPolicy.js";
import { methodNotAllowed, unauthorized, withPrivateApiHeaders } from "../_lib/http.js";
import { withLegacyAuthHeaders } from "../_lib/authHttp.js";
import { requireAuthContext } from "../_lib/authContextMiddleware.js";
import { listLegacyMembershipOptions } from "../_lib/authContext.js";
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

function legacyUserDto(user, authorization, memberships, commercialAuthority = null) {
  return {
    name: user.name,
    role: authorization.role,
    status: user.status,
    permissions: authorization.effectivePermissions,
    deniedPermissions: authorization.deniedPermissions,
    membership: {
      membershipRef: authorization.membershipRef,
      tenantName: authorization.tenant.name,
      role: authorization.role,
    },
    memberships,
    ...(commercialAuthority === "PREVIEW_REHEARSAL" ? { commercialCrmPreviewAuthorized: true } : {}),
    ...(commercialAuthority === "PRODUCTION_READ" ? { commercialCrmProductionAuthorized: true } : {}),
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

async function findMembershipOptions(userId) {
  try {
    return { memberships: await listLegacyMembershipOptions(prisma, userId), unavailable: false };
  } catch {
    return { memberships: [], unavailable: true };
  }
}

const legacyMeHandler = withPrivateApiHeaders(async (req, res) => {
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
    const canonicalContext = await requireAuthContext(req, res, { prisma });
    if (!canonicalContext) return;
    const lookup = await findCurrentUser(canonicalContext.userId);
    if (lookup.unavailable) return databaseUnavailable(res);
    const legacyUser = lookup.user;
    if (!legacyUser || !isGloballyActiveUser(legacyUser.status)) return unauthorized(res);
    const optionsLookup = await findMembershipOptions(canonicalContext.userId);
    if (optionsLookup.unavailable) return databaseUnavailable(res);
    const memberships = optionsLookup.memberships;
    if (previewRequested) {
      try {
        const context = await resolveV17CommercialCrmPreviewSessionContext(req, { env: process.env, prisma });
        return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser, context, memberships, "PREVIEW_REHEARSAL") });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    if (productionRequested) {
      try {
        const context = await resolveV17CommercialCrmProductionSessionContext(req, { env: process.env, prisma });
        return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser, context, memberships, "PRODUCTION_READ") });
      } catch (error) {
        return sendCommercialTenancyError(res, error);
      }
    }
    return res.status(200).json({ ok: true, user: legacyUserDto(legacyUser, canonicalContext, memberships) });
  }

  const context = await requireAuthContext(req, res, { prisma });
  if (!context) return;

  if (context.authType === "LEGACY") {
    const lookup = await findCurrentUser(context.userId);
    if (lookup.unavailable) return databaseUnavailable(res);
    const user = lookup.user;
    if (!user || !isGloballyActiveUser(user.status)) return unauthorized(res);
    const optionsLookup = await findMembershipOptions(context.userId);
    if (optionsLookup.unavailable) return databaseUnavailable(res);
    const memberships = optionsLookup.memberships;
    const legacyUser = legacyUserDto(user, context, memberships);
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
}, { handleOptions: false });

export default withLegacyAuthHeaders(legacyMeHandler, { methods: ["GET"] });

