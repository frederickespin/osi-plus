import type { SurveyAssignment, SurveyDraft } from "./types";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}
async function hash(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function hashBytes(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function command(operation: string, payload: Record<string, unknown>) {
  const requestId = crypto.randomUUID();
  return {
    requestId,
    payloadHash: await hash({ operation, requestId, ...payload }),
    ...payload,
  };
}
async function json<T>(
  authorization: string | undefined,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${authorization || ""}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(body.error || "CRM_SURVEY_REQUEST_FAILED"), {
      status: response.status,
      code: body.error,
    });
  return body.data as T;
}
export function createSurveyApi(authorization?: string) {
  return Object.freeze({
    agenda: () =>
      json<readonly SurveyAssignment[]>(
        authorization,
        "/api/crm/survey/assignments",
      ),
    draft: (surveyRef: string) =>
      json<SurveyDraft>(
        authorization,
        `/api/crm/survey/drafts/${encodeURIComponent(surveyRef)}`,
      ),
    assignmentAction: async (
      assignmentRef: string,
      operation: string,
      expectedVersion: number,
    ) =>
      json<{ surveyRef?: string; version: number }>(
        authorization,
        `/api/crm/survey/assignments/${encodeURIComponent(assignmentRef)}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            await command(operation, { operation, expectedVersion }),
          ),
        },
      ),
    mutateDraft: async (
      surveyRef: string,
      operation: string,
      payload: Record<string, unknown>,
    ) =>
      json<{ version: number; itemRef?: string; status: string }>(
        authorization,
        `/api/crm/survey/drafts/${encodeURIComponent(surveyRef)}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            await command(operation, { operation, ...payload }),
          ),
        },
      ),
    publish: async (surveyRef: string, payload: Record<string, unknown>) =>
      json<{ publicationRef: string; pdfSha256: string }>(
        authorization,
        `/api/crm/survey/drafts/${encodeURIComponent(surveyRef)}/publish`,
        {
          method: "POST",
          body: JSON.stringify(await command("PUBLISH_SURVEY", payload)),
        },
      ),
    downloadPdf: async (publicationRef: string) => {
      const response = await fetch(
        `/api/crm/survey/publications/${encodeURIComponent(publicationRef)}/pdf`,
        { headers: { Authorization: `Bearer ${authorization || ""}` } },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || "CRM_SURVEY_PDF_FAILED"), {
          status: response.status,
        });
      }
      return response.blob();
    },
    uploadPhoto: async (
      surveyRef: string,
      file: File,
      metadata: { purpose: string; itemRef?: string; accessRef?: string },
    ) => {
      const bytes = await file.arrayBuffer();
      const requestId = crypto.randomUUID();
      const payload = {
        purpose: metadata.purpose,
        itemRef: metadata.itemRef || null,
        accessRef: metadata.accessRef || null,
        mimeType: file.type,
        sizeBytes: bytes.byteLength,
        sha256: await hashBytes(bytes),
      };
      const payloadHash = await hash({
        operation: "PHOTO_ATTACH",
        requestId,
        ...payload,
      });
      const response = await fetch(
        `/api/crm/survey/drafts/${encodeURIComponent(surveyRef)}/photos`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authorization || ""}`,
            "Content-Type": file.type,
            "x-survey-request-id": requestId,
            "x-survey-payload-hash": payloadHash,
            "x-survey-photo-purpose": metadata.purpose,
            ...(metadata.itemRef
              ? { "x-survey-item-ref": metadata.itemRef }
              : {}),
            ...(metadata.accessRef
              ? { "x-survey-access-ref": metadata.accessRef }
              : {}),
          },
          body: bytes,
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Object.assign(
          new Error(body.error || "CRM_SURVEY_UPLOAD_FAILED"),
          { status: response.status },
        );
      return body.data;
    },
  });
}
