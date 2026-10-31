import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

// Exercise the actual production modules in a new, unsigned-in browser context.
// No project Vite configuration, env files, API proxy or external network is used.
export async function runBuiltAssetsSmokeTest({ distDir = process.env.DIST_DIR || "dist" } = {}) {
  const directory = resolve(distDir);
  await access(resolve(directory, "index.html"));
  const report = { ok: false, distDir: directory, loginVisible: false, pageErrors: [],
    blockedRequests: { api: 0, external: 0, other: 0, websocket: 0 } };
  const server = await preview({
    configFile: false, envFile: false, publicDir: false, logLevel: "silent",
    build: { outDir: directory },
    preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false, proxy: {}, cors: false },
  });
  let browser;
  try {
    const address = server.httpServer.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
      throw new Error("BUILT_ASSETS_SMOKE_NONLOCAL_SERVER");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { pathname = "/api/invalid"; }
      let blocked = null;
      if (url.origin !== origin) blocked = "external";
      else if (/^\/api(?:\/|$)/u.test(pathname) || ["fetch", "xhr", "eventsource"].includes(request.resourceType())) blocked = "api";
      else if (!["GET", "HEAD"].includes(request.method())
        || !["document", "script", "stylesheet", "image", "font", "media", "texttrack", "manifest"].includes(request.resourceType())) blocked = "other";
      if (blocked) { report.blockedRequests[blocked] += 1; await route.abort("blockedbyclient"); }
      else await route.continue();
    });
    await context.routeWebSocket("**/*", (socket) => {
      report.blockedRequests.websocket += 1;
      socket.close();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.pageErrors.push({ name: error.name, message: error.message,
      stack: error.stack?.split("\n").slice(0, 6).join("\n") }));
    const response = await page.goto(origin, { waitUntil: "load", timeout: 15000 });
    if (!response?.ok()) throw new Error("BUILT_ASSETS_SMOKE_DOCUMENT_FAILED");
    if (report.pageErrors.length === 0) {
      try {
        await page.getByRole("button", { name: "Iniciar Sesión", exact: true }).waitFor({ state: "visible", timeout: 10000 });
        report.loginVisible = await page.getByLabel("Correo electrónico", { exact: true }).isVisible()
          && await page.getByLabel("Contraseña", { exact: true }).isVisible();
      } catch { report.loginVisible = false; }
    }
    report.ok = report.loginVisible && report.pageErrors.length === 0;
    return report;
  } finally {
    try { await browser?.close(); }
    finally { await new Promise((done) => server.httpServer.close(done)); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("BUILT_ASSETS_SMOKE_ARGUMENTS_INVALID");
    const report = await runBuiltAssetsSmokeTest();
    process.stdout.write(`${JSON.stringify({ builtAssetsSmoke: report }, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ builtAssetsSmoke: { ok: false, error: error.message } })}\n`);
    process.exitCode = 1;
  }
}
