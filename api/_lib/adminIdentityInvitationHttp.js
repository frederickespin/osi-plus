import { prisma as defaultPrisma } from "./db.js";
import { JsonBodyError, readJsonObject, withPrivateApiHeaders } from "./http.js";
import { setCrmPrivateHeaders } from "./crmHttpHeaders.js";
import { setAuthPrivateHeaders } from "./authHttp.js";
import { getBearerToken, verifyStrictLegacyAccessToken } from "./auth.js";
import { resolveCrmPipelineContext } from "./crmPipelineAccess.js";
import {
  ADMIN_IDENTITY_INVITATION_MODES,
  AdminMembershipAccessError,
  V17_PRODUCTION_PILOT_GATES,
  requireAdminIdentityInvitationAccess,
  requireAdminProductionPilotContext,
} from "./adminMembershipAccess.js";
import { AdminMembershipError } from "./adminMembershipDomain.js";
import {
  AdminIdentityInvitationError,
  acceptExistingAdminIdentity,
  activateNewAdminIdentity,
  ADMIN_IDENTITY_ACTIVATION_MODES,
  issueAdminIdentityInvitation,
  listAdminIdentityInvitations,
  normalizeAdminInvitationEmail,
  resolveAdminIdentityActivation,
  revokeAdminIdentityInvitation,
} from "./adminIdentityInvitationDomain.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import {
  requireV17ProductionPilotTenant,
  resolveV17ProductionPilotActivation,
} from "./v17ProductionPilotGate.js";

const ISSUE_LOCAL_FIELDS = new Set(["requestId", "email"]);
const ISSUE_PRODUCTION_PILOT_FIELDS = new Set(["requestId"]);
const REVOKE_FIELDS = new Set(["requestId", "action"]);
const RESOLVE_FIELDS = new Set(["action", "token"]);
const ACTIVATE_NEW_FIELDS = new Set(["action", "token", "name", "password"]);
const ACTIVATE_EXISTING_FIELDS = new Set(["action", "token"]);

function exact(body, fields, code = "ADMIN_IDENTITY_INVITATION_INVALID") {
  if (Object.keys(body).some((key) => !fields.has(key))) throw new AdminIdentityInvitationError(code, 400);
  return body;
}

function sameOrigin(req) {
  const origin = req?.headers?.origin;
  if (origin === undefined) return;
  const host = req?.headers?.host;
  const protocol = req?.headers?.["x-forwarded-proto"] ?? (req?.socket?.encrypted ? "https" : "http");
  if (Array.isArray(origin) || Array.isArray(host) || origin !== `${protocol}://${host}`) {
    throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_ORIGIN_FORBIDDEN", 403);
  }
}

function methodNotAllowed(res, methods, head = false) {
  res.setHeader("Allow", methods.join(", "));
  if (head) return res.status(405).end();
  return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
}

function controlled(error) {
  return error instanceof AdminIdentityInvitationError || error instanceof AdminMembershipError
    || error instanceof AdminMembershipAccessError
    || error instanceof CommercialTenancyError || error instanceof Mt01bAuthError;
}

function sendAdminError(res, error, head = false) {
  const status = controlled(error) && Number.isInteger(error.status) ? error.status : 503;
  const code = controlled(error) ? String(error.code || "ADMIN_IDENTITY_INVITATION_UNAVAILABLE") : "ADMIN_IDENTITY_INVITATION_UNAVAILABLE";
  if (head) return res.status(status).end();
  return res.status(status).json({ ok: false, error: code });
}

function sendActivationError(res, error) {
  if (error instanceof AdminMembershipAccessError) return res.status(error.status).json({ ok: false, error: error.code });
  if (error instanceof JsonBodyError) return res.status(error.status).json({ ok: false, error: "ADMIN_IDENTITY_ACTIVATION_INVALID" });
  const policy = error instanceof AdminIdentityInvitationError && error.code === "ADMIN_IDENTITY_PASSWORD_POLICY_INVALID";
  if (policy) return res.status(400).json({ ok: false, error: error.code });
  const unavailable = !controlled(error);
  return res.status(unavailable ? 503 : 400).json({ ok: false, error: unavailable ? "ADMIN_IDENTITY_ACTIVATION_UNAVAILABLE" : "ADMIN_IDENTITY_ACTIVATION_INVALID" });
}

function productionPilotRecipient(env, mode) {
  if (mode !== ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) return undefined;
  const raw = env.V17_PRODUCTION_PILOT_ADMIN_EMAIL;
  try {
    return normalizeAdminInvitationEmail(raw);
  } catch {
    throw new AdminMembershipAccessError("ADMIN_IDENTITY_INVITATION_CONFIGURATION_INVALID", 503);
  }
}

function invitationForMode(invitation, mode) {
  if (mode !== ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) return invitation;
  return Object.freeze({
    invitationRef: invitation.invitationRef,
    role: invitation.role,
    grantedPermissions: invitation.grantedPermissions,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  });
}

function requireProductionPilotActivationTenant(env, mode, tenantCode) {
  if (mode !== ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) return;
  try {
    requireV17ProductionPilotTenant(
      resolveV17ProductionPilotActivation(env), tenantCode,
      V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS,
    );
  } catch { throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400); }
}

export function createAdminIdentityInvitationCollectionHandler({
  env = process.env, prisma = defaultPrisma, resolveContext = resolveCrmPipelineContext,
  list = listAdminIdentityInvitations, issue = issueAdminIdentityInvitation,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    const head = req.method === "HEAD";
    try {
      const mode = requireAdminIdentityInvitationAccess(req, env);
      if (!["GET", "HEAD", "POST"].includes(req.method)) return methodNotAllowed(res, ["GET", "HEAD", "POST"], head);
      sameOrigin(req);
      let issueInput;
      if (req.method === "POST") {
        const body = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 8 * 1024 });
        if (mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
          exact(body, ISSUE_PRODUCTION_PILOT_FIELDS);
          issueInput = Object.freeze({ requestId: body.requestId, email: productionPilotRecipient(env, mode) });
        } else {
          issueInput = exact(body, ISSUE_LOCAL_FIELDS);
        }
      }
      const context = await resolveContext(req, { prisma, env });
      if (mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
        requireAdminProductionPilotContext(env, context, V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS);
      }
      if (req.method === "POST") {
        const result = await issue(prisma, context, issueInput);
        return res.status(201).json({ ok: true, ...result, invitation: invitationForMode(result.invitation, mode) });
      }
      const invitations = await list(prisma, context);
      if (head) return res.status(200).end();
      return res.status(200).json({ ok: true, invitations: invitations.map((invitation) => invitationForMode(invitation, mode)) });
    } catch (error) {
      return sendAdminError(res, error, head);
    }
  }, { handleOptions: false });
}

export function createAdminIdentityInvitationDetailHandler({
  env = process.env, prisma = defaultPrisma, resolveContext = resolveCrmPipelineContext,
  revoke = revokeAdminIdentityInvitation,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setCrmPrivateHeaders(res);
    try {
      const mode = requireAdminIdentityInvitationAccess(req, env);
      if (req.method !== "PATCH") return methodNotAllowed(res, ["PATCH"]);
      sameOrigin(req);
      const context = await resolveContext(req, { prisma, env });
      if (mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
        requireAdminProductionPilotContext(env, context, V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS);
      }
      const ref = Array.isArray(req.query?.invitationRef) ? null : req.query?.invitationRef;
      const body = exact(await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 4 * 1024 }), REVOKE_FIELDS);
      if (body.action !== "REVOKE") throw new AdminIdentityInvitationError("ADMIN_IDENTITY_INVITATION_INVALID", 400);
      const invitation = await revoke(prisma, context, ref, body);
      return res.status(200).json({ ok: true, invitation: invitationForMode(invitation, mode) });
    } catch (error) {
      return sendAdminError(res, error);
    }
  }, { handleOptions: false });
}

export function createAdminIdentityActivationHandler({
  env = process.env, prisma = defaultPrisma,
  resolveActivation = resolveAdminIdentityActivation,
  activateNew = activateNewAdminIdentity, acceptExisting = acceptExistingAdminIdentity,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setAuthPrivateHeaders(res);
    try {
      const mode = requireAdminIdentityInvitationAccess(req, env);
      if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
      sameOrigin(req);
      const body = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 16 * 1024 });
      if (body.action !== "RESOLVE" && body.action !== "ACTIVATE") {
        throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400);
      }
      if (body.action === "RESOLVE") exact(body, RESOLVE_FIELDS, "ADMIN_IDENTITY_ACTIVATION_INVALID");
      else exact(body, ACTIVATE_NEW_FIELDS, "ADMIN_IDENTITY_ACTIVATION_INVALID");
      const expectedRecipientEmail = productionPilotRecipient(env, mode);
      const resolution = await resolveActivation(prisma, { token: body.token }, { expectedRecipientEmail });
      requireProductionPilotActivationTenant(env, mode, resolution.tenantCode);
      if (body.action === "RESOLVE") {
        return res.status(200).json({ ok: true, mode: resolution.mode });
      }
      if (resolution.mode === ADMIN_IDENTITY_ACTIVATION_MODES.NEW_IDENTITY) {
        exact(body, ACTIVATE_NEW_FIELDS, "ADMIN_IDENTITY_ACTIVATION_INVALID");
        const result = await activateNew(prisma, body, { expectedRecipientEmail });
        return res.status(200).json({ ok: true, ...result });
      }
      if (resolution.mode !== ADMIN_IDENTITY_ACTIVATION_MODES.EXISTING_IDENTITY) {
        throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400);
      }
      exact(body, ACTIVATE_EXISTING_FIELDS, "ADMIN_IDENTITY_ACTIVATION_INVALID");
      const bearer = getBearerToken(req);
      let legacyIdentity;
      try { legacyIdentity = verifyStrictLegacyAccessToken(bearer); } catch {
        throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400);
      }
      const result = await acceptExisting(prisma, body, legacyIdentity, { expectedRecipientEmail });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return sendActivationError(res, error);
    }
  }, { handleOptions: false });
}
