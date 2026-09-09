import { prisma } from "../../_lib/db.js";
import { prepareClientTemporaryRequest, sendClientTemporaryError } from "../../_lib/clientTemporaryAccessHttp.js";
import { openClientTemporaryAccessByCode } from "../../_lib/clientTemporaryAccessDomain.js";
import { methodNotAllowed, readJsonObject, withPrivateApiHeaders } from "../../_lib/http.js";

export default withPrivateApiHeaders(async (req, res) => {
  if (!prepareClientTemporaryRequest(req, res)) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const input = await readJsonObject(req, { required: true, requireNonEmptyObject: true, maxBytes: 1024 });
    if (Object.keys(input).length !== 1 || typeof input.code !== "string") return res.status(400).json({ ok: false, error: "CLIENT_TEMPORARY_INPUT_INVALID" });
    return res.status(200).json({ ok: true, data: await openClientTemporaryAccessByCode(req.query?.accessRef, input.code, prisma) });
  } catch (error) { return sendClientTemporaryError(res, error); }
}, { handleOptions: false });
