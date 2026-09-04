import { prisma } from "../../../../_lib/db.js";
import { resolveCrmPipelineContext } from "../../../../_lib/crmPipelineAccess.js";
import { getSurveyPublicationPdf } from "../../../../_lib/crmSurveyDomain.js";
import {
  prepareCrmSurveyRequest,
  sendCrmSurveyError,
} from "../../../../_lib/crmSurveyHttp.js";
import {
  methodNotAllowed,
  withPrivateApiHeaders,
} from "../../../../_lib/http.js";

export default withPrivateApiHeaders(
  async (req, res) => {
    if (!prepareCrmSurveyRequest(req, res)) return;
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!["GET", "HEAD"].includes(req.method))
      return methodNotAllowed(res, ["GET", "HEAD"]);
    try {
      const context = await resolveCrmPipelineContext(req, { prisma });
      const pdf = await getSurveyPublicationPdf(
        context,
        req.query?.publicationRef,
        prisma,
      );
      res.setHeader("Content-Type", pdf.mimeType);
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="survey-publicado.pdf"',
      );
      res.setHeader("Content-Length", String(pdf.bytes.length));
      res.setHeader("ETag", `"${pdf.sha256}"`);
      return req.method === "HEAD"
        ? res.status(200).end()
        : res.status(200).send(pdf.bytes);
    } catch (error) {
      return sendCrmSurveyError(res, error, req.method === "HEAD");
    }
  },
  { handleOptions: false },
);
