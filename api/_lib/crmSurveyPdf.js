import { createHash } from "node:crypto";

const FORBIDDEN_PDF_KEYS = /(?:price|cost|margin|internal|password|token|authorization|cookie|tenantId|userId|membershipId)/i;

function cleanText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[()\\]/g, (character) => `\\${character}`)
    .slice(0, 180);
}

function publishedLines(snapshot) {
  const lines = [
    "OSI PLUS | SURVEY PUBLICADO",
    `Referencia: ${cleanText(snapshot.publicationRef)}`,
    `Caso: ${cleanText(snapshot.caseCode)}`,
    `Cliente: ${cleanText(snapshot.clientDisplayName || "Sin cliente vinculado")}`,
    `Servicio: ${cleanText(snapshot.serviceDescription)}`,
    `Origen: ${cleanText(snapshot.originSummary)}`,
    `Destino: ${cleanText(snapshot.destinationSummary)}`,
    `Evaluador: ${cleanText(snapshot.evaluatorDisplayName)}`,
    `Firmante: ${cleanText(snapshot.signerName)} (${cleanText(snapshot.relationship)})`,
    `Publicado: ${cleanText(snapshot.publishedAt)}`,
    `Total: ${snapshot.totalQuantity} articulos | ${snapshot.totalVolumeM3.toFixed(3)} m3 / ${(snapshot.totalVolumeM3 * 35.3146667).toFixed(2)} ft3 | ${snapshot.totalWeightKg.toFixed(2)} kg / ${(snapshot.totalWeightKg * 2.20462262).toFixed(2)} lb`,
    "",
    "INVENTARIO OBSERVADO",
  ];
  for (const item of snapshot.items) {
    lines.push(`${item.quantity} x ${cleanText(item.articleName)} | ${cleanText(item.areaName)} | ${cleanText(item.condition)} | ${Number(item.totalVolumeM3 || 0).toFixed(3)} m3 | evidencia ${item.photoRefs?.length || 0}`);
  }
  lines.push("", "ACCESOS OBSERVADOS");
  for (const access of snapshot.access) lines.push(`${cleanText(access.side)} | ${cleanText(access.summary)} | evidencia ${access.photoRefs?.length || 0}`);
  lines.push("", "Declaracion: este documento representa hechos observados y la firma dibujada incorporada a esta publicacion inmutable.");
  return lines;
}

function signatureCommands(strokes) {
  const paths = (strokes || []).map((stroke) => stroke.map(({ x, y }, index) => `${(50 + x * 250).toFixed(2)} ${(90 + (1 - y) * 80).toFixed(2)} ${index ? "l" : "m"}`).join(" ")).filter(Boolean);
  return paths.length ? `q 1.5 w 0.06 0.09 0.16 RG ${paths.map((path) => `${path} S`).join(" ")} Q` : "";
}

function makePdf(lines, strokes) {
  const pages = [];
  for (let index = 0; index < lines.length; index += 42) pages.push(lines.slice(index, index + 42));
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add("");
  const pagesObject = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const pageLines of pages) {
    const signature = pageIds.length === 0 ? signatureCommands(strokes) : "";
    const content = `BT /F1 10 Tf 50 790 Td 14 TL ${pageLines.map((line, position) => `${position ? "T* " : ""}(${cleanText(line)}) Tj`).join(" ")} ET ${signature}`;
    const contentId = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let body = "%PDF-1.4\n%OSIPlus\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export function renderSurveyPublicationPdf(snapshot) {
  for (const key of Object.keys(snapshot || {})) {
    if (FORBIDDEN_PDF_KEYS.test(key)) throw new Error("CRM_SURVEY_PDF_PRIVATE_FIELD");
  }
  const bytes = makePdf(publishedLines(snapshot), snapshot.signatureStrokes);
  return Object.freeze({
    bytes,
    mimeType: "application/pdf",
    logicalSha256: createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex"),
    pdfSha256: createHash("sha256").update(bytes).digest("hex"),
    pageCount: Math.max(1, Math.ceil(publishedLines(snapshot).length / 42)),
  });
}

export function renderSurveySignatureSvg(strokes) {
  const paths = strokes.map((stroke) => {
    const points = stroke.map(({ x, y }) => `${Math.round(x * 600)},${Math.round(y * 200)}`).join(" ");
    return `<polyline points="${points}"/>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><g fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`, "utf8");
}
