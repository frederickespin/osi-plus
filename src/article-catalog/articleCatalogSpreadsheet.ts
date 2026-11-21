import spreadsheetLibraryUrl from "@/internal-tools/archaeological-packing/vendor/xlsx.full.min.js?url";
import type { ArticleCatalogEntry } from "./articleCatalogApi";

export const ARTICLE_CATALOG_LIMIT = 500;
const FILE_LIMIT = 5 * 1024 * 1024;
const SHEET_ROW_LIMIT = 10_001;
const HEADER_SCAN_LIMIT = 8;
const SHEET_NAME = "Artículos";
const HEADERS = ["Código", "Artículo", "Sinónimos", "Volumen m³"];
const ARTICLE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;
const MAX_VOLUME = 999_999.999999;
const HEADER_NAMES = {
  code: ["codigo", "codigoarticulo", "codigodelarticulo", "code"],
  name: ["articulo", "nombre", "nombrearticulo", "nombredelarticulo", "name"],
  aliases: ["sinonimos", "sinonimo", "alias", "aliases"],
  volume: ["volumen", "volumenm3", "volumendereferencia", "volumendereferenciam3", "volumenreferenciam3", "m3", "cbm"],
};

type Column = keyof typeof HEADER_NAMES;
type Cell = Readonly<{ t?: string; v?: unknown; f?: string }>;
type Sheet = Record<string, unknown>;
type Workbook = Readonly<{ SheetNames: string[]; Sheets: Record<string, Sheet | undefined> }>;
type SheetJs = Readonly<{
  read(data: ArrayBuffer, options: { type: "array"; bookSheets?: boolean; sheets?: string; sheetRows?: number; cellDates?: boolean; cellHTML?: boolean }): Workbook;
  writeFile(book: Workbook, filename: string, options: { bookType: "xlsx"; compression: boolean }): void;
  utils: {
    aoa_to_sheet(rows: (string | number)[][]): Sheet;
    book_new(): Workbook;
    book_append_sheet(book: Workbook, sheet: Sheet, name: string): void;
    decode_cell(address: string): { r: number; c: number };
    decode_range(address: string): { e: { r: number } };
  };
}>;

export type ArticleCatalogImportRow = Readonly<{
  row: number;
  status: "create" | "update" | "unchanged" | "error";
  code: string;
  name: string;
  aliases: readonly string[];
  defaultVolumeM3: number | null;
  error: string | null;
}>;

export type ArticleCatalogImportPlan = Readonly<{
  rows: readonly ArticleCatalogImportRow[];
  entries: readonly ArticleCatalogEntry[];
  error: string | null;
}>;

let scriptPromise: Promise<SheetJs> | undefined;

function spreadsheetApi(): Promise<SheetJs> {
  const host = window as Window & { XLSX?: SheetJs };
  if (host.XLSX) return Promise.resolve(host.XLSX);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<SheetJs>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${spreadsheetLibraryUrl}"]`);
    const script = existing ?? document.createElement("script");
    const rejectLoad = () => {
      script.remove();
      reject(new Error("No se pudo cargar el lector de Excel."));
    };
    script.addEventListener("load", () => {
      if (host.XLSX) resolve(host.XLSX);
      else rejectLoad();
    }, { once: true });
    script.addEventListener("error", rejectLoad, { once: true });
    if (!existing) {
      script.src = spreadsheetLibraryUrl;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((failure: unknown) => {
    scriptPromise = undefined;
    throw failure;
  });
  return scriptPromise;
}

export function createArticleCatalogCode() {
  return "ART_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
}

export async function downloadArticleCatalogTemplate() {
  const xlsx = await spreadsheetApi();
  const book = xlsx.utils.book_new();
  const template = xlsx.utils.aoa_to_sheet([HEADERS]);
  template["!cols"] = [{ wch: 22 }, { wch: 38 }, { wch: 42 }, { wch: 17 }];
  xlsx.utils.book_append_sheet(book, template, SHEET_NAME);
  const guide = xlsx.utils.aoa_to_sheet([
    ["Plantilla del catálogo de artículos"],
    ["Rellena la hoja Artículos. Copia el ejemplo si necesitas una referencia."],
    ["Usa el código existente para actualizar un artículo, incluso si cambias su nombre."],
    ["Sin código, se busca un nombre exacto en el catálogo. Si el nombre es nuevo, se genera el código."],
    ["Separa los sinónimos con comas. Registra el volumen de una unidad en metros cúbicos."],
    ["Una celda vacía en Sinónimos o Volumen borra ese valor. Si eliminas la columna, se conserva el valor existente."],
    [],
    HEADERS,
    ["", "Sofá de tres plazas", "Sofá, sillón de sala", 1.25],
  ]);
  guide["!cols"] = [{ wch: 32 }, { wch: 38 }, { wch: 42 }, { wch: 17 }];
  xlsx.utils.book_append_sheet(book, guide, "Guía");
  xlsx.writeFile(book, "plantilla-catalogo-articulos.xlsx", { bookType: "xlsx", compression: true });
}

function failed(error: string): ArticleCatalogImportPlan {
  return { error, rows: [], entries: [] };
}

function folded(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
}

function nameKey(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("es")
    .replace(/n\u0303/gu, "ñ").replace(/\p{M}/gu, "")
    .trim().replace(/\s+/gu, " ");
}

function cellText(cell: Cell | undefined): string | null {
  if (!cell) return "";
  if (cell.t === "e" || (cell.f && cell.v == null)) return null;
  if (cell.v == null) return "";
  if (typeof cell.v !== "string" && typeof cell.v !== "number") return null;
  const value = String(cell.v).trim();
  return value.includes("\0") ? null : value;
}

function parseVolume(cell: Cell | undefined) {
  const raw = cellText(cell);
  if (raw === "") return null;
  const value = typeof cell?.v === "number" && cell.t !== "e"
    ? cell.v
    : raw !== null && /^(?:\d+(?:[,.]\d{1,6})?|[,.]\d{1,6})$/u.test(raw)
      ? Number(raw.replace(",", "."))
      : NaN;
  if (!Number.isFinite(value) || value < 0 || value > MAX_VOLUME) return NaN;
  const rounded = Number(value.toFixed(6));
  return Math.abs(rounded - value) <= Number.EPSILON * Math.max(1, value) * 2 ? rounded : NaN;
}

function worksheetRows(sheet: Sheet, xlsx: SheetJs) {
  const rows = new Map<number, Map<number, Cell>>();
  for (const [address, value] of Object.entries(sheet)) {
    if (!/^[A-Z]+[1-9][0-9]*$/u.test(address) || typeof value !== "object" || value === null) continue;
    const cell = value as Cell;
    if (cellText(cell) === "") continue;
    const { r, c } = xlsx.utils.decode_cell(address);
    const cells = rows.get(r) ?? new Map<number, Cell>();
    cells.set(c, cell);
    rows.set(r, cells);
  }
  return [...rows].sort(([left], [right]) => left - right);
}

function headerColumn(cell: Cell) {
  const key = folded(cellText(cell) ?? "").replace(/[^a-z0-9]+/gu, "");
  return (Object.keys(HEADER_NAMES) as Column[]).find((column) => HEADER_NAMES[column].includes(key));
}

function unchanged(a: ArticleCatalogEntry, b: ArticleCatalogEntry) {
  return a.name === b.name && a.defaultVolumeM3 === b.defaultVolumeM3
    && a.aliases.length === b.aliases.length && a.aliases.every((alias, index) => alias === b.aliases[index]);
}

export async function readArticleCatalogImport(file: File, current: readonly ArticleCatalogEntry[]): Promise<ArticleCatalogImportPlan> {
  if (!/\.xlsx?$/iu.test(file.name)) return failed("Selecciona un archivo de Excel (.xlsx o .xls).");
  if (file.size > FILE_LIMIT) return failed("El archivo supera los 5 MB. Carga solo la hoja de artículos.");
  const xlsx = await spreadsheetApi();
  let sheet: Sheet | undefined;
  try {
    const data = await file.arrayBuffer();
    const { SheetNames } = xlsx.read(data, { type: "array", bookSheets: true });
    const sheetName = SheetNames.find((name) => folded(name) === "articulos") ?? SheetNames[0];
    if (sheetName) {
      const book = xlsx.read(data, { type: "array", sheets: sheetName, sheetRows: SHEET_ROW_LIMIT, cellDates: true, cellHTML: false });
      sheet = book.Sheets[sheetName];
    }
  } catch {
    return failed("No se pudo leer el archivo. Verifica que abra en Excel.");
  }
  if (!sheet) return failed("El archivo no contiene una hoja de artículos.");
  if (typeof sheet["!fullref"] === "string" && xlsx.utils.decode_range(sheet["!fullref"]).e.r >= SHEET_ROW_LIMIT) {
    return failed("La hoja se extiende más allá de la fila 10.001. Copia los encabezados y artículos en una hoja nueva.");
  }
  const sheetData = worksheetRows(sheet, xlsx);
  const headerIndex = sheetData.slice(0, HEADER_SCAN_LIMIT).findIndex(([, cells]) =>
    [...cells.values()].some((cell) => headerColumn(cell) === "name"));
  if (headerIndex < 0) return failed("Incluye un encabezado Artículo o Nombre al comienzo de la hoja.");
  const columns = new Map<Column, number>();
  for (const [index, cell] of sheetData[headerIndex][1]) {
    const column = headerColumn(cell);
    if (!column) continue;
    if (columns.has(column)) return failed("Hay dos columnas para el mismo dato. Conserva un solo encabezado por campo.");
    columns.set(column, index);
  }
  const usedColumns = [...columns.values()];
  const rows = sheetData.slice(headerIndex + 1).filter(([, cells]) => usedColumns.some((index) => cells.has(index)));
  if (rows.length === 0) return failed("La hoja no tiene artículos para importar.");
  if (rows.length > ARTICLE_CATALOG_LIMIT) return failed(`El archivo supera los ${ARTICLE_CATALOG_LIMIT} artículos por importación.`);

  const byCode = new Map(current.map((article) => [article.code, article]));
  const byName = new Map<string, ArticleCatalogEntry[]>();
  for (const article of current) {
    const key = nameKey(article.name);
    const matches = byName.get(key) ?? [];
    matches.push(article);
    byName.set(key, matches);
  }
  const fileCodes = new Set<string>();
  const fileNames = new Set<string>();
  const namesWithoutCode = new Set<string>();
  const preview: ArticleCatalogImportRow[] = [];
  const entries: ArticleCatalogEntry[] = [];
  let created = 0;
  for (const [rowIndex, cells] of rows) {
    const get = (column: Column) => cells.get(columns.get(column) ?? -1);
    const codeText = cellText(get("code"));
    const providedCode = codeText?.toUpperCase() ?? "";
    const name = cellText(get("name")) ?? "";
    const normalizedName = nameKey(name);
    const sameName = byName.get(normalizedName) ?? [];
    const existing = providedCode ? byCode.get(providedCode) : sameName.length === 1 ? sameName[0] : undefined;
    const synonymText = cellText(get("aliases"));
    const aliases = columns.has("aliases")
      ? [...new Set((synonymText ?? "").split(/[,;\n]/u).map((value) => value.trim()).filter(Boolean))]
      : existing?.aliases ?? [];
    const defaultVolumeM3 = columns.has("volume") ? parseVolume(get("volume")) : existing?.defaultVolumeM3 ?? null;
    const target = existing?.code ?? providedCode;
    let error: string | null = null;
    if (!name || name.length > 160) error = "Escribe un nombre de hasta 160 caracteres.";
    else if (codeText === null || (providedCode && !ARTICLE_CODE.test(providedCode))) error = "El código debe comenzar con una letra y tener de 2 a 64 letras, números o guiones bajos.";
    else if (!providedCode && sameName.length > 1) error = "Varios artículos tienen ese nombre. Indica el código del artículo que quieres actualizar.";
    else if (target && fileCodes.has(target)) error = "El código ya aparece en una fila anterior del archivo.";
    else if (namesWithoutCode.has(normalizedName) || (!providedCode && fileNames.has(normalizedName))) error = "El nombre se repite en el archivo. Indica un código distinto para cada artículo.";
    else if (synonymText === null || aliases.length > 20 || aliases.some((alias) => alias.length > 80)) error = "Registra hasta 20 sinónimos de 80 caracteres cada uno.";
    else if (Number.isNaN(defaultVolumeM3)) error = "El volumen debe ser un número en m³ entre 0 y 999.999,999999, con hasta seis decimales.";
    if (target) fileCodes.add(target);
    if (normalizedName) fileNames.add(normalizedName);
    if (normalizedName && !providedCode) namesWithoutCode.add(normalizedName);
    if (error) {
      preview.push({ row: rowIndex + 1, status: "error", code: target.slice(0, 64), name: name.slice(0, 160), aliases: [], defaultVolumeM3: null, error });
      continue;
    }
    let code = target || createArticleCatalogCode();
    while (!target && (byCode.has(code) || fileCodes.has(code))) code = createArticleCatalogCode();
    fileCodes.add(code);
    const article = { code, name, aliases, defaultVolumeM3 };
    const status = !existing ? "create" : unchanged(existing, article) ? "unchanged" : "update";
    preview.push({ row: rowIndex + 1, status, ...article, error: null });
    if (status !== "unchanged") entries.push(article);
    if (status === "create") created += 1;
  }
  const error = current.length + created > ARTICLE_CATALOG_LIMIT ? `El catálogo admite hasta ${ARTICLE_CATALOG_LIMIT} artículos. Reduce las filas nuevas del archivo.` : null;
  return { rows: preview, entries, error };
}
