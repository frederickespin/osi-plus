import { prisma as defaultPrisma } from "./db.js";
import { Prisma } from "@prisma/client";
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
  issueAdminIdentityInvitation,
  hashAdminInvitationToken,
  listAdminIdentityInvitations,
  revokeAdminIdentityInvitation,
} from "./adminIdentityInvitationDomain.js";
import { CommercialTenancyError } from "./commercialTenancyWrite.js";
import { Mt01bAuthError } from "./authPolicy.js";
import {
  requireV17ProductionPilotTenant,
  resolveV17ProductionPilotActivation,
} from "./v17ProductionPilotGate.js";

const ISSUE_FIELDS = new Set(["requestId", "email"]);
const REVOKE_FIELDS = new Set(["requestId", "action"]);
const ACTIVATE_FIELDS = new Set(["token", "name", "password"]);

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

async function requireProductionPilotInvitationToken(prisma, env, token, now = new Date()) {
  let tokenHash;
  try { tokenHash = hashAdminInvitationToken(token); } catch { throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400); }
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT t."code" AS "tenant_code"
    FROM "osi"."admin_identity_invitations" invitation
    JOIN "osi"."tenants" t ON t."id"=invitation."tenant_id"
    WHERE invitation."token_hash"=${tokenHash} AND invitation."status"='PENDING'
      AND invitation."expires_at">${now} AND t."status"='ACTIVE'
    LIMIT 2
  `);
  try {
    if (rows.length !== 1) throw new Error("not found");
    requireV17ProductionPilotTenant(
      resolveV17ProductionPilotActivation(env),
      rows[0].tenant_code,
      V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS,
    );
  } catch {
    throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400);
  }
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
      const context = await resolveContext(req, { prisma, env });
      if (mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
        requireAdminProductionPilotContext(env, context, V17_PRODUCTION_PILOT_GATES.ADMIN_IDENTITY_INVITATIONS);
      }
      if (req.method === "POST") {
        const body = exact(await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 8 * 1024 }), ISSUE_FIELDS);
        const result = await issue(prisma, context, body);
        return res.status(201).json({ ok: true, ...result });
      }
      const invitations = await list(prisma, context);
      if (head) return res.status(200).end();
      return res.status(200).json({ ok: true, invitations });
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
      return res.status(200).json({ ok: true, invitation });
    } catch (error) {
      return sendAdminError(res, error);
    }
  }, { handleOptions: false });
}

export function createAdminIdentityActivationHandler({
  env = process.env, prisma = defaultPrisma,
  activateNew = activateNewAdminIdentity, acceptExisting = acceptExistingAdminIdentity,
} = {}) {
  return withPrivateApiHeaders(async (req, res) => {
    setAuthPrivateHeaders(res);
    try {
      const mode = requireAdminIdentityInvitationAccess(req, env);
      if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
      sameOrigin(req);
      const bearer = getBearerToken(req);
      let legacyIdentity = null;
      if (bearer) {
        try { legacyIdentity = verifyStrictLegacyAccessToken(bearer); } catch { throw new AdminIdentityInvitationError("ADMIN_IDENTITY_ACTIVATION_INVALID", 400); }
      }
      const body = exact(await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 16 * 1024 }), ACTIVATE_FIELDS, "ADMIN_IDENTITY_ACTIVATION_INVALID");
      if (mode === ADMIN_IDENTITY_INVITATION_MODES.PRODUCTION_PILOT) {
        await requireProductionPilotInvitationToken(prisma, env, body.token);
      }
      const result = legacyIdentity
        ? await acceptExisting(prisma, body, legacyIdentity)
        : await activateNew(prisma, body);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return sendActivationError(res, error);
    }
  }, { handleOptions: false });
}
