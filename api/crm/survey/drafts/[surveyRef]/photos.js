import { prisma } from "../../../../_lib/db.js";
import { resolveCrmPipelineContext } from "../../../../_lib/crmPipelineAccess.js";
import { prepareCrmSurveyRequest, readSurveyBinaryBody, sendCrmSurveyError } from "../../../../_lib/crmSurveyHttp.js";
import { uploadSurveyPhoto } from "../../../../_lib/crmSurveyDomain.js";
import { methodNotAllowed, withPrivateApiHeaders } from "../../../../_lib/http.js";
export const config = { api: { bodyParser: false } };
export default withPrivateApiHeaders(async (req, res) => {
  if (!prepareCrmSurveyRequest(req, res)) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const context = await resolveCrmPipelineContext(req, { prisma });
    const bytes = await readSurveyBinaryBody(req);
    const result = await uploadSurveyPhoto(context, req.query?.surveyRef, { requestId: req.headers["x-survey-request-id"], payloadHash: req.headers["x-survey-payload-hash"], purpose: req.headers["x-survey-photo-purpose"], itemRef: req.headers["x-survey-item-ref"] || null, accessRef: req.headers["x-survey-access-ref"] || null }, bytes, String(req.headers["content-type"] || ""), prisma);
    return res.status(201).json({ ok: true, data: result });
  } catch (error) { return sendCrmSurveyError(res, error); }
}, { handleOptions: false });
