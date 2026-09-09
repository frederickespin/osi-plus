import { prisma } from "../../_lib/db.js";
import { clientTemporaryTokenFromRequest, prepareClientTemporaryRequest, sendClientTemporaryError } from "../../_lib/clientTemporaryAccessHttp.js";
import { uploadClientSurveyAsset } from "../../_lib/clientTemporaryAccessDomain.js";
import { methodNotAllowed, withPrivateApiHeaders } from "../../_lib/http.js";

export const config = { api: { bodyParser: false } };

function one(req, name) { const value = req.headers?.[name]; return Array.isArray(value) ? null : value; }
async function bytes(req, maximum = 12 * 1024 * 1024) {
  const parts = []; let size = 0;
  for await (const chunk of req) { const value = Buffer.from(chunk); size += value.length; if (size > maximum) throw Object.assign(new Error("CLIENT_TEMPORARY_BLOB_INVALID"), { code: "CLIENT_TEMPORARY_BLOB_INVALID", status: 413 }); parts.push(value); }
  if (!size) throw Object.assign(new Error("CLIENT_TEMPORARY_BLOB_INVALID"), { code: "CLIENT_TEMPORARY_BLOB_INVALID", status: 400 }); return Buffer.concat(parts);
}

export default withPrivateApiHeaders(async (req, res) => {
  if (!prepareClientTemporaryRequest(req, res)) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const token = clientTemporaryTokenFromRequest(req); const body = await bytes(req);
    const metadata = { requestId: one(req, "x-client-request-id"), payloadHash: one(req, "x-client-payload-hash"), category: one(req, "x-client-asset-category"), documentType: one(req, "x-client-document-type") || null, mimeType: String(one(req, "content-type") || "").split(";", 1)[0].trim().toLowerCase() };
    return res.status(200).json({ ok: true, data: await uploadClientSurveyAsset(req.query?.accessRef, token, metadata, body, prisma) });
  } catch (error) { return sendClientTemporaryError(res, error); }
}, { handleOptions: false });
