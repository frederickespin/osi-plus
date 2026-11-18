export type ContractPdfContext = Readonly<{
  caseCode: string;
  clientName: string;
  serviceName: string;
  templateName: string;
  termsReference: string;
  bodyText: string;
  documentReference: string;
  isFinal: boolean;
}>;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = "0.000 0.231 0.439";
const SKY = "0.000 0.439 0.659";
const SLATE = "0.278 0.333 0.412";
const LIGHT = "0.953 0.969 0.984";
const BORDER = "0.827 0.859 0.898";
const WHITE = "1 1 1";
const AMBER = "0.710 0.345 0.047";
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
  const max = Math.max(10, Math.floor(width / (fontSize * 0.52)));
  const lines: string[] = [];
  let line = "";
  value.trim().split(/\s+/).filter(Boolean).forEach((word) => {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= max) line += ` ${word}`;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class ContractPainter {
  readonly pages: string[][] = [];
  cursor = 0;
  constructor(private readonly context: ContractPdfContext) { this.newPage(); }
  private page() { return this.pages[this.pages.length - 1]; }
  private command(value: string) { this.page().push(value); }
  private y(top: number) { return PAGE_HEIGHT - top; }
  private text(x: number, top: number, value: string, size = 9, bold = false, color = SLATE, align: "left" | "right" = "left") {
    const textX = align === "right" ? x - winAnsi(value).length * size * 0.5 : x;
    this.command(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${textX.toFixed(2)} ${this.y(top).toFixed(2)} Tm (${pdfString(value)}) Tj ET`);
  }
  private line(x1: number, top1: number, x2: number, top2: number, color = BORDER, width = 0.5) { this.command(`${color} RG ${width} w ${x1.toFixed(2)} ${this.y(top1).toFixed(2)} m ${x2.toFixed(2)} ${this.y(top2).toFixed(2)} l S`); }
  private rect(x: number, top: number, width: number, height: number, fill = WHITE, stroke = BORDER) { this.command(`${fill} rg ${stroke} RG 0.7 w ${x.toFixed(2)} ${this.y(top + height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re B`); }
  private newPage() {
    this.pages.push([]);
    this.command(`${WHITE} rg 0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)} re f`);
    this.command(`${BLUE} rg 0 ${(PAGE_HEIGHT - 68).toFixed(2)} ${PAGE_WIDTH.toFixed(2)} 68 re f`);
    this.text(MARGIN, 27, "OSi Plus ERP", 16, true, WHITE);
    this.text(MARGIN, 45, "INTERNATIONAL PACKERS", 7, true, "0.733 0.855 0.953");
    this.text(PAGE_WIDTH - MARGIN, 29, this.context.isFinal ? "COPIA CONTRACTUAL" : "BORRADOR PARA REVISIÓN", 8, true, WHITE, "right");
    this.text(PAGE_WIDTH - MARGIN, 46, this.context.documentReference, 7, false, "0.733 0.855 0.953", "right");
    this.cursor = 91;
  }
  private ensure(height: number) { if (this.cursor + height > PAGE_HEIGHT - 54) this.newPage(); }
  private wrapped(value: string, size = 9, bold = false, color = SLATE, indent = 0) {
    const lines = wrap(value, CONTENT_WIDTH - indent, size);
    this.ensure(lines.length * (size + 4) + 4);
    lines.forEach((line, index) => this.text(MARGIN + indent, this.cursor + index * (size + 4), line, size, bold, color));
    this.cursor += lines.length * (size + 4) + 4;
  }
  meta() {
    this.rect(MARGIN, this.cursor, CONTENT_WIDTH, 70, LIGHT, BORDER);
    const rows = [
      ["CLIENTE", this.context.clientName, "CASO", this.context.caseCode],
      ["SERVICIO", this.context.serviceName, "TÉRMINOS", this.context.termsReference],
    ];
    rows.forEach((row, index) => {
      const top = this.cursor + 17 + index * 29;
      this.text(MARGIN + 12, top, row[0], 6.5, true, SKY);
      this.text(MARGIN + 72, top, row[1], 8.5, true, BLUE);
      this.text(MARGIN + 288, top, row[2], 6.5, true, SKY);
      this.text(MARGIN + 346, top, row[3], 8, true, BLUE);
    });
    this.cursor += 88;
  }
  body() {
    this.context.bodyText.split(/\r?\n/).forEach((raw) => {
      const value = raw.trim();
      if (!value) { this.cursor += 8; return; }
      const heading = value.length <= 72 && (value === value.toUpperCase() || /^\d+\.\s/.test(value));
      const pending = /\[[^\]]+\]/.test(value);
      this.wrapped(value, heading ? 10 : 8.8, heading, pending ? AMBER : heading ? BLUE : SLATE, heading ? 0 : 4);
    });
  }
  finalize() {
    this.pages.forEach((page, index) => {
      page.push(`${BORDER} RG 0.5 w ${MARGIN} 34 m ${(PAGE_WIDTH - MARGIN).toFixed(2)} 34 l S`);
      page.push(`BT /F1 6.8 Tf ${SLATE} rg 1 0 0 1 ${MARGIN} 20 Tm (${pdfString(`${this.context.termsReference} · generado ${new Date().toLocaleString("es-DO")}`)}) Tj ET`);
      const footer = `Página ${index + 1} de ${this.pages.length}`;
      page.push(`BT /F1 6.8 Tf ${SLATE} rg 1 0 0 1 ${(PAGE_WIDTH - MARGIN - footer.length * 3.4).toFixed(2)} 20 Tm (${pdfString(footer)}) Tj ET`);
    });
  }
}

function buildPdfBinary(pageStreams: readonly string[][]) {
  const pageCount = pageStreams.length;
  const fontRegular = 3 + pageCount * 2;
  const fontBold = fontRegular + 1;
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`];
  pageStreams.forEach((commands, index) => {
    const stream = commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${binaryBytes(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets.push(binaryBytes(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = binaryBytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return binaryBytes(pdf);
}

export function createContractPdfBlob(context: ContractPdfContext) {
  const painter = new ContractPainter(context);
  painter.meta();
  painter.body();
  painter.finalize();
  return new Blob([buildPdfBinary(painter.pages)], { type: "application/pdf" });
}

const safeFilename = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
export function previewContractPdf(context: ContractPdfContext) {
  const url = URL.createObjectURL(createContractPdfBlob(context));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function downloadContractPdf(context: ContractPdfContext) {
  const url = URL.createObjectURL(createContractPdfBlob(context));
  const link = document.createElement("a");
  link.href = url;
  link.download = `contrato-${safeFilename(context.caseCode)}-${safeFilename(context.clientName)}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
