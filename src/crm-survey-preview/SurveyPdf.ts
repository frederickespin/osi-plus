import type { SurveyArticle, SurveyArticleFlag } from "./SurveyWorkflowPanels";

export type SurveyReportAddress = Readonly<{ city: string; sector: string; street: string; unit: string }>;
export type SurveyReportContext = Readonly<{
  reference: string; client: string; company: string; leadAccount: string; booker: string;
  service: string; origin: SurveyReportAddress; destination?: SurveyReportAddress;
  instruction: string; surveyDate: string; evaluator: string;
}>;
export type SignaturePoint = Readonly<{ x: number; y: number }>;
export type SignatureStroke = readonly SignaturePoint[];
export type SurveyPdfSignature = Readonly<{ name: string; relationship: string; signedAt?: string; strokes: readonly SignatureStroke[] }>;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = "0.000 0.231 0.439";
const SKY = "0.000 0.502 0.733";
const SLATE = "0.278 0.333 0.412";
const LIGHT = "0.945 0.965 0.980";
const BORDER = "0.827 0.859 0.898";
const WHITE = "1 1 1";
const ROSE = "0.745 0.110 0.204";
const CP1252: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function winAnsi(value: string) {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) || 0x3f;
    result += String.fromCharCode(code <= 0xff ? code : CP1252[code] ?? 0x3f);
  }
  return result;
}
const pdfString = (value: string) => winAnsi(value).replace(/([\\()])/g, "\\$1").replace(/\r?\n/g, " ");
function binaryBytes(value: string) { const bytes = new Uint8Array(value.length); for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff; return bytes; }
function wrap(value: string, width: number, fontSize: number) {
  const max = Math.max(8, Math.floor(width / (fontSize * 0.52)));
  const lines: string[] = []; let line = "";
  value.trim().split(/\s+/).filter(Boolean).forEach((word) => { if (!line) line = word; else if (`${line} ${word}`.length <= max) line += ` ${word}`; else { lines.push(line); line = word; } });
  if (line) lines.push(line); return lines.length ? lines : [""];
}
function totals(articles: readonly SurveyArticle[]) { return { lines: articles.length, pieces: articles.reduce((sum, item) => sum + item.quantity, 0), volume: articles.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0), weight: articles.reduce((sum, item) => sum + item.weightKg * item.quantity, 0) }; }
const piecesText = (pieces: number) => `${pieces} ${pieces === 1 ? "pieza" : "piezas"}`;
function groupBy<T>(values: readonly T[], key: (value: T) => string) { const groups = new Map<string, T[]>(); values.forEach((value) => groups.set(key(value), [...(groups.get(key(value)) || []), value])); return [...groups.entries()]; }
const FLAG_SHORT: Readonly<Record<SurveyArticleFlag, string>> = { "Caja de madera": "Huacal", "Frágil": "Frágil", "Armar": "Armar", "Desarmar": "Desarmar", "Recomendar grúa": "Grúa", "Valioso": "AV", "Sobredimensionado": "SD" };

class ReportPainter {
  pages: string[][] = []; cursor = 0; section = "";
  constructor() { this.newPage("RESUMEN DEL SURVEY"); }
  private page() { return this.pages[this.pages.length - 1]; }
  private command(value: string) { this.page().push(value); }
  private y(top: number) { return PAGE_HEIGHT - top; }
  newPage(section: string) {
    this.section = section; this.pages.push([]);
    this.command(`${WHITE} rg 0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)} re f`);
    this.command(`${BLUE} rg 0 ${(PAGE_HEIGHT - 74).toFixed(2)} ${PAGE_WIDTH.toFixed(2)} 74 re f`);
    this.text(MARGIN, 27, "OSi Plus ERP", 17, true, WHITE);
    this.text(MARGIN, 45, "INTERNATIONAL PACKERS", 7.5, true, "0.733 0.855 0.953");
    this.text(PAGE_WIDTH - MARGIN, 30, section, 8, true, WHITE, "right");
    this.text(PAGE_WIDTH - MARGIN, 47, "Documento de Survey - sin precios", 7, false, "0.733 0.855 0.953", "right");
    this.cursor = 95;
  }
  ensure(height: number, section = this.section) { if (this.cursor + height > PAGE_HEIGHT - 48) this.newPage(`${section} - CONTINUACIÓN`); }
  text(x: number, top: number, value: string, size = 9, bold = false, color = SLATE, align: "left" | "right" = "left") {
    const textX = align === "right" ? x - winAnsi(value).length * size * 0.5 : x;
    this.command(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${textX.toFixed(2)} ${this.y(top).toFixed(2)} Tm (${pdfString(value)}) Tj ET`);
  }
  wrappedText(x: number, top: number, value: string, width: number, size = 8, color = SLATE, bold = false, leading = size + 3) { const lines = wrap(value, width, size); lines.forEach((line, index) => this.text(x, top + index * leading, line, size, bold, color)); return lines.length * leading; }
  rect(x: number, top: number, width: number, height: number, fill = WHITE, stroke = BORDER) { this.command(`${fill} rg ${stroke} RG 0.7 w ${x.toFixed(2)} ${this.y(top + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re B`); }
  line(x1: number, top1: number, x2: number, top2: number, color = BORDER, width = 0.5) { this.command(`${color} RG ${width} w ${x1.toFixed(2)} ${this.y(top1).toFixed(2)} m ${x2.toFixed(2)} ${this.y(top2).toFixed(2)} l S`); }
  heading(title: string, subtitle?: string) { const height = subtitle ? 34 : 24; this.ensure(height); this.text(MARGIN, this.cursor + 10, title.toUpperCase(), 9, true, SKY); if (subtitle) this.text(MARGIN, this.cursor + 25, subtitle, 7.5, false, SLATE); this.cursor += height; }
  labelValue(x: number, top: number, label: string, value: string, width: number) { this.text(x, top, label.toUpperCase(), 6.5, true, "0.392 0.455 0.545"); return this.wrappedText(x, top + 13, value || "No informado", width, 8.5, BLUE, true, 11); }
  signature(strokes: readonly SignatureStroke[], x: number, top: number, width: number, height: number) {
    this.rect(x, top, width, height, WHITE, BORDER);
    strokes.forEach((stroke) => { if (stroke.length < 2) return; const [first, ...rest] = stroke; let path = `${BLUE} RG 1.4 w 1 J 1 j ${(x + first.x * width).toFixed(2)} ${this.y(top + first.y * height).toFixed(2)} m`; rest.forEach((point) => { path += ` ${(x + point.x * width).toFixed(2)} ${this.y(top + point.y * height).toFixed(2)} l`; }); this.command(`${path} S`); });
  }
  finalize(reference: string) { this.pages.forEach((page, index) => { page.push(`${BORDER} RG 0.5 w ${MARGIN} 34 m ${(PAGE_WIDTH - MARGIN).toFixed(2)} 34 l S`); page.push(`BT /F1 7 Tf ${SLATE} rg 1 0 0 1 ${MARGIN} 20 Tm (${pdfString(`OSI Plus - ${reference} - versión firmada`)}) Tj ET`); const footer = `Página ${index + 1} de ${this.pages.length}`; page.push(`BT /F1 7 Tf ${SLATE} rg 1 0 0 1 ${(PAGE_WIDTH - MARGIN - footer.length * 3.5).toFixed(2)} 20 Tm (${pdfString(footer)}) Tj ET`); }); }
}

function buildPdfBinary(pageStreams: readonly string[][]) {
  const pageCount = pageStreams.length; const fontRegular = 3 + pageCount * 2; const fontBold = fontRegular + 1; const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); objects.push(`<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`);
  pageStreams.forEach((commands, index) => { const stream = commands.join("\n"); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`); objects.push(`<< /Length ${binaryBytes(stream).length} >>\nstream\n${stream}\nendstream`); });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let pdf = "%PDF-1.4\n%âãÏÓ\n"; const offsets: number[] = [0]; objects.forEach((object, index) => { offsets.push(binaryBytes(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = binaryBytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return binaryBytes(pdf);
}
const addressText = (address?: SurveyReportAddress) => address ? `${address.city}, ${address.sector}. ${address.street}. ${address.unit}.` : "Destino pendiente de confirmar.";
function materialsFrom(articles: readonly SurveyArticle[]) { const values = new Map<string, number>(); articles.forEach((article) => article.packing.forEach(([name, quantity]) => values.set(name, (values.get(name) || 0) + quantity * article.quantity))); return [...values.entries()]; }

export function createSurveyPdfBlob(context: SurveyReportContext, articles: readonly SurveyArticle[], signature: SurveyPdfSignature) {
  const painter = new ReportPainter(); const summary = totals(articles);
  painter.text(MARGIN, painter.cursor, "RESUMEN DE SURVEY", 20, true, BLUE); painter.text(PAGE_WIDTH - MARGIN, painter.cursor, context.reference, 10, true, SKY, "right"); painter.cursor += 26;
  painter.rect(MARGIN, painter.cursor, CONTENT_WIDTH, 71, LIGHT, BORDER);
  [["Cliente", context.client], ["Empresa", context.company], ["Servicio", context.service], ["Lead account", context.leadAccount], ["Booker", context.booker], ["Survey", context.surveyDate]].forEach(([label, value], index) => { const column = index % 3; const row = Math.floor(index / 3); const widths = [160, 145, 160]; const xs = [MARGIN + 12, MARGIN + 186, MARGIN + 345]; painter.labelValue(xs[column], painter.cursor + 16 + row * 32, label, value, widths[column]); });
  painter.cursor += 86; painter.heading("Origen y destino", "Direcciones y contexto confirmado para la visita");
  const addressTop = painter.cursor; const half = (CONTENT_WIDTH - 10) / 2; painter.rect(MARGIN, addressTop, half, 82); painter.rect(MARGIN + half + 10, addressTop, half, 82);
  painter.text(MARGIN + 12, addressTop + 16, "ORIGEN", 8, true, SKY); painter.wrappedText(MARGIN + 12, addressTop + 34, addressText(context.origin), half - 24, 8.5, BLUE, true, 12);
  painter.text(MARGIN + half + 22, addressTop + 16, "DESTINO", 8, true, SKY); painter.wrappedText(MARGIN + half + 22, addressTop + 34, addressText(context.destination), half - 24, 8.5, BLUE, true, 12); painter.cursor += 94;
  painter.heading("Resumen ejecutivo"); const cards = [["RENGLONES", String(summary.lines)], ["PIEZAS", String(summary.pieces)], ["VOLUMEN", `${summary.volume.toFixed(2)} m³ / ${(summary.volume * 35.3147).toFixed(1)} ft³`], ["PESO REFERENCIAL", `${summary.weight.toFixed(0)} kg / ${(summary.weight * 2.20462).toFixed(0)} lb`]]; const cardWidth = (CONTENT_WIDTH - 18) / 4;
  cards.forEach(([label, value], index) => { const x = MARGIN + index * (cardWidth + 6); painter.rect(x, painter.cursor, cardWidth, 54, LIGHT, BORDER); painter.text(x + 8, painter.cursor + 16, label, 6.5, true, SKY); painter.wrappedText(x + 8, painter.cursor + 34, value, cardWidth - 16, 9.5, BLUE, true, 11); }); painter.cursor += 68;
  painter.heading("Distribución por modo"); groupBy(articles, (article) => article.mode).forEach(([mode, items]) => { const modeTotals = totals(items); painter.ensure(22); painter.text(MARGIN + 8, painter.cursor + 12, mode, 8.5, true, BLUE); painter.text(PAGE_WIDTH - MARGIN - 8, painter.cursor + 12, `${piecesText(modeTotals.pieces)}  |  ${modeTotals.volume.toFixed(2)} m³  |  ${modeTotals.weight.toFixed(0)} kg`, 8, false, SLATE, "right"); painter.line(MARGIN, painter.cursor + 18, PAGE_WIDTH - MARGIN, painter.cursor + 18); painter.cursor += 22; });
  painter.cursor += 8; painter.heading("Preferencias e instrucciones"); painter.rect(MARGIN, painter.cursor, CONTENT_WIDTH, 52); painter.wrappedText(MARGIN + 12, painter.cursor + 18, context.instruction || "Sin instrucciones registradas.", CONTENT_WIDTH - 24, 8.5, SLATE, false, 12); painter.cursor += 64; painter.text(MARGIN, painter.cursor, "Este documento registra el levantamiento realizado. No constituye una cotización ni aceptación de precios.", 7.5, true, ROSE);

  painter.newPage("INVENTARIO DETALLADO"); painter.text(MARGIN, painter.cursor, "INVENTARIO POR ÁREA", 16, true, BLUE); painter.cursor += 22;
  groupBy(articles, (article) => article.room).forEach(([room, items]) => { painter.ensure(34 + items.length * 29, "INVENTARIO DETALLADO"); painter.rect(MARGIN, painter.cursor, CONTENT_WIDTH, 22, LIGHT, BORDER); painter.text(MARGIN + 8, painter.cursor + 15, room, 8.5, true, BLUE); painter.cursor += 22; painter.text(MARGIN + 6, painter.cursor + 12, "ARTÍCULO", 6.5, true); painter.text(MARGIN + 252, painter.cursor + 12, "CANT.", 6.5, true); painter.text(MARGIN + 298, painter.cursor + 12, "MODO", 6.5, true); painter.text(MARGIN + 380, painter.cursor + 12, "VOL. / PESO", 6.5, true); painter.cursor += 18;
    items.forEach((article) => { painter.ensure(31, "INVENTARIO DETALLADO"); painter.text(MARGIN + 6, painter.cursor + 11, article.name, 8.2, true, BLUE); const detail = [article.condition, ...article.flags.map((flag) => FLAG_SHORT[flag]), article.note ? "Con nota" : "", article.photoCount ? `${article.photoCount} foto${article.photoCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" - "); painter.text(MARGIN + 6, painter.cursor + 23, detail || "Buen estado", 6.8, false, article.condition.includes("Averiado") || article.condition.includes("Daño") ? ROSE : SLATE); painter.text(MARGIN + 258, painter.cursor + 15, String(article.quantity), 8, true, BLUE); painter.text(MARGIN + 298, painter.cursor + 15, article.mode, 7.5); painter.text(PAGE_WIDTH - MARGIN - 6, painter.cursor + 10, `${(article.volumeM3 * article.quantity).toFixed(2)} m³ / ${(article.weightKg * article.quantity).toFixed(0)} kg`, 7.5, true, BLUE, "right"); painter.text(PAGE_WIDTH - MARGIN - 6, painter.cursor + 22, `${(article.volumeM3 * article.quantity * 35.3147).toFixed(1)} ft³ / ${(article.weightKg * article.quantity * 2.20462).toFixed(0)} lb`, 6.5, false, SLATE, "right"); painter.line(MARGIN, painter.cursor + 28, PAGE_WIDTH - MARGIN, painter.cursor + 28); painter.cursor += 29; }); painter.cursor += 8;
  });
  painter.heading("Condiciones especiales y evidencias", "Sólo se muestran las condiciones registradas durante la visita");
  articles.filter((article) => article.flags.length || article.note || article.photoCount || article.condition !== "Buen estado").forEach((article) => { const details = [article.condition, ...article.flags.map((flag) => FLAG_SHORT[flag])]; if (article.dimensions) details.push(`${article.dimensions.lengthCm} x ${article.dimensions.widthCm} x ${article.dimensions.heightCm} cm`); if (article.photoCount) details.push(`${article.photoCount} evidencia${article.photoCount === 1 ? "" : "s"} fotográfica${article.photoCount === 1 ? "" : "s"}`); if (article.note) details.push(`Nota: ${article.note}`); const height = Math.max(26, wrap(details.join(" - "), CONTENT_WIDTH - 130, 7.5).length * 10 + 12); painter.ensure(height, "CONDICIONES Y EVIDENCIAS"); painter.text(MARGIN + 6, painter.cursor + 13, article.name, 8, true, BLUE); painter.wrappedText(MARGIN + 126, painter.cursor + 12, details.join(" - "), CONTENT_WIDTH - 132, 7.5, SLATE, false, 10); painter.line(MARGIN, painter.cursor + height, PAGE_WIDTH - MARGIN, painter.cursor + height); painter.cursor += height; });
  painter.heading("Resumen técnico derivado", "Estimación automática; el evaluador no selecciona materiales de empaque"); materialsFrom(articles).forEach(([material, quantity]) => { painter.ensure(17, "RESUMEN TÉCNICO"); painter.text(MARGIN + 8, painter.cursor + 11, material, 7.5); painter.text(PAGE_WIDTH - MARGIN - 8, painter.cursor + 11, String(quantity), 7.5, true, BLUE, "right"); painter.line(MARGIN, painter.cursor + 15, PAGE_WIDTH - MARGIN, painter.cursor + 15); painter.cursor += 17; });

  painter.newPage("ACEPTACIÓN Y FIRMA"); painter.text(MARGIN, painter.cursor, "ACEPTACIÓN DEL CLIENTE", 16, true, BLUE); painter.cursor += 28; painter.rect(MARGIN, painter.cursor, CONTENT_WIDTH, 98, LIGHT, BORDER);
  painter.wrappedText(MARGIN + 14, painter.cursor + 22, `Yo, ${signature.name || context.client}, confirmo que he revisado el resumen del Survey ${context.reference} y que representa los artículos, áreas, condiciones y observaciones mostrados durante la visita.`, CONTENT_WIDTH - 28, 9, BLUE, true, 14);
  painter.wrappedText(MARGIN + 14, painter.cursor + 67, "Este levantamiento no constituye una cotización, contrato de servicio ni aceptación de precios. Los pesos y volúmenes son referenciales hasta su validación operativa.", CONTENT_WIDTH - 28, 8, SLATE, false, 12); painter.cursor += 116; painter.heading("Firma manuscrita"); painter.signature(signature.strokes, MARGIN, painter.cursor, CONTENT_WIDTH, 150); if (!signature.strokes.length) painter.text(MARGIN + CONTENT_WIDTH / 2 + 70, painter.cursor + 78, "Vista previa - firma pendiente", 10, true, "0.647 0.686 0.741", "right"); painter.cursor += 164;
  painter.line(MARGIN, painter.cursor, MARGIN + 235, painter.cursor, BLUE, 0.8); painter.line(MARGIN + 270, painter.cursor, PAGE_WIDTH - MARGIN, painter.cursor, BLUE, 0.8); painter.text(MARGIN, painter.cursor + 15, signature.name || context.client, 9, true, BLUE); painter.text(MARGIN, painter.cursor + 29, signature.relationship || "Cliente", 7.5); painter.text(MARGIN + 270, painter.cursor + 15, signature.signedAt || "Pendiente de firma", 9, true, BLUE); painter.text(MARGIN + 270, painter.cursor + 29, "Fecha y hora de aceptación", 7.5); painter.cursor += 58;
  painter.heading("Control del documento"); painter.rect(MARGIN, painter.cursor, CONTENT_WIDTH, 72); painter.labelValue(MARGIN + 12, painter.cursor + 18, "Evaluador", context.evaluator, 155); painter.labelValue(MARGIN + 180, painter.cursor + 18, "Referencia", context.reference, 140); painter.labelValue(MARGIN + 334, painter.cursor + 18, "Estado", signature.signedAt ? "Firmado por el cliente" : "Borrador para revisión", 170); painter.text(MARGIN + 12, painter.cursor + 55, "La copia entregada conserva la misma referencia, versión y contenido aceptado.", 7.5);
  painter.finalize(context.reference); return new Blob([buildPdfBinary(painter.pages)], { type: "application/pdf" });
}
const safeFilename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
export function previewSurveyPdf(context: SurveyReportContext, articles: readonly SurveyArticle[], signature: SurveyPdfSignature) { const url = URL.createObjectURL(createSurveyPdfBlob(context, articles, signature)); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
export function downloadSurveyPdf(context: SurveyReportContext, articles: readonly SurveyArticle[], signature: SurveyPdfSignature) { const url = URL.createObjectURL(createSurveyPdfBlob(context, articles, signature)); const link = document.createElement("a"); link.href = url; link.download = `survey-${safeFilename(context.client)}.pdf`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
