import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const fail = (message) => { throw new Error(`V17_TOOLS_ARCHAEOLOGY_GUARD_FAILED: ${message}`); };
const read = (path) => readFileSync(path);
const text = (path) => read(path).toString("utf8");
const digest = (path) => createHash("sha256").update(text(path).replace(/\r\n/gu, "\n")).digest("hex").toUpperCase();

const documentPath = "src/internal-tools/archaeological-packing/index.html";
const vendorPath = "src/internal-tools/archaeological-packing/vendor/xlsx.full.min.js";
const packingDocumentPath = "src/internal-tools/general-packing/index.html";
const document = text(documentPath);
const packingDocument = text(packingDocumentPath);
const wrapper = text("src/hub/ArchaeologicalPackingTool.tsx");
const packingWrapper = text("src/hub/GeneralPackingTool.tsx");
const catalog = text("src/hub/appCatalog.ts");
const workspace = text("src/hub/HubWorkspace.tsx");
const mobileHub = text("src/hub/OsiPlusMobileHub.tsx");
const visualMode = text("src/tools-preview/clientMode.ts");
const visualPreview = text("src/tools-preview/ToolsVisualPreview.tsx");
const app = text("src/App.tsx");

if (digest(documentPath) !== "FF74CC4424891058AFF9D19E875229B03F7AE616CB6BFCC76D4B364603C54F6E") fail("the approved 3.19 calculator document changed");
if (digest(vendorPath) !== "CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41") fail("the pinned SheetJS asset changed");
if (digest(packingDocumentPath) !== "D64FD3D0AFF6D55719634A9D140C08E121DDF770FFD57C9082E7974557E56E4C") fail("the approved 4.19.1 packing calculator changed");
if (!document.includes("<title>Embalaje arqueológico · 3.19</title>") || !document.includes('revision:"3.19"')) fail("calculator revision is not 3.19");
const scriptSources = [...document.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/giu)].map((match) => match[1]);
if (scriptSources.length !== 1 || scriptSources[0] !== "./vendor/xlsx.full.min.js") fail("calculator must use only its pinned local spreadsheet library");
if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|postMessage)\b/u.test(document)) fail("standalone calculator gained a network or host bridge");
if (!document.includes('localStorage.setItem(LS_KEY') || !document.includes('localStorage.getItem(key)')) fail("local-only recovery behavior is missing");
if (!packingDocument.includes("Calculadora de Empaque v4.19.1") || !packingDocument.includes("const VERSION='4.19.1'")) fail("packing calculator revision is not 4.19.1");
if (/<script\s+[^>]*src=/iu.test(packingDocument) || /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|postMessage)\b/u.test(packingDocument)) fail("packing calculator gained a network dependency or host bridge");

for (const signature of [
  'appId: "archaeological-packing"',
  'route: "/tools/archaeological-packing"',
  'appId: "packing-calculator"',
  'route: "/tools/packing"',
  'routeAliases: ["/mobile/packing"]',
  'status: "INTERNAL_STANDALONE"',
  'suiteId: "tools"',
]) if (!catalog.includes(signature)) fail(`catalog contract missing: ${signature}`);
if (catalog.includes("ip-suite-inventario-empaquee.vercel.app")) fail("archaeological calculator delegates to the retired external application");
for (const signature of [
  'index.html?raw',
  'xlsx.full.min.js?url',
  'sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"',
  'referrerPolicy="no-referrer"',
  'Interna · sin conexión ERP',
]) if (!wrapper.includes(signature)) fail(`isolated wrapper contract missing: ${signature}`);
if (!workspace.includes('lazy(() => import("./ArchaeologicalPackingTool"))')) fail("calculator is not behind the authorized lazy boundary");
if (!workspace.includes('lazy(() => import("./GeneralPackingTool"))')) fail("general packing tool is not behind the authorized lazy boundary");
if (!workspace.includes('applicationsForHubSuite("tools", available)')) fail("desktop tools suite is not resolved independently");
if (!workspace.includes('pathname === "/tools"')) fail("desktop tools route is not rendered by the Hub");
if (mobileHub.includes("herramientas de empaque") || mobileHub.includes("Calculadora")) fail("OSi Plus Mobile still advertises desktop calculators");
if (!visualMode.includes('feature/v17-tools-consolidated-11b') || !visualMode.includes('/experience-preview/tools')) fail("exact Preview route contract is missing");
for (const signature of [
  'const APPROVED_COMMERCIAL_PIPELINE_URL = "https://osi-plus-v17-experience-preview-02a-hub.vercel.app/sales/pipeline"',
  '"/commercial": APPROVED_COMMERCIAL_PIPELINE_URL',
  '"/warehouses": `${CONSOLIDATED_HUB_ORIGIN}/warehouses`',
  '"/administration": `${CONSOLIDATED_HUB_ORIGIN}/administration`',
  '"/mobile/survey": "https://osi-plus-erp-v17-git-feature-642495-frederick-espinals-projects.vercel.app/mobile/survey"',
  'catalogPreviewLaunchUrls={PREVIEW_LAUNCH_URLS}',
]) if (!visualPreview.includes(signature)) fail(`functional Preview destination missing: ${signature}`);
if (!app.includes("isV17ToolsVisualPreviewRoute()") || !app.includes("<ToolsVisualPreview")) fail("visual Preview is not routed before authenticated runtime");
for (const signature of [
  'index.html?raw',
  'sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"',
  'referrerPolicy="no-referrer"',
  'Interna · sin conexión ERP',
]) if (!packingWrapper.includes(signature)) fail(`general packing wrapper contract missing: ${signature}`);

console.log(JSON.stringify({ ok: true, archaeologyRevision: "3.19", packingRevision: "4.19.1", documentSha256: digest(documentPath), packingSha256: digest(packingDocumentPath), vendorSha256: digest(vendorPath), connectedToErp: false }));
