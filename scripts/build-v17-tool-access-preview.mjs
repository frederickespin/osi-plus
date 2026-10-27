import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL_ENV === "production") {
  throw new Error("This navigation review is preview-only; production deployment is not supported.");
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(repo, ".tool-access-dist");
await build({
  configFile: false,
  root: resolve(repo, "review/tool-access"),
  base: "/",
  publicDir: false,
  envPrefix: "TOOL_ACCESS_REVIEW_PUBLIC_",
  plugins: [react()],
  resolve: { alias: { "@": resolve(repo, "src") } },
  css: { postcss: repo },
  build: { outDir, emptyOutDir: true, sourcemap: false },
});
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const config = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  version: 2,
  framework: null,
  buildCommand: "",
  installCommand: "",
  routes: [
    { src: "/(.*)", headers: { "Content-Security-Policy": csp, "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" }, continue: true },
    { src: "/api(?:/.*)?", dest: "/api-disabled.json", status: 404 },
    { handle: "filesystem" },
    { src: "/(?:hub|quotation-tools|mobile-processes)/?", dest: "/index.html" },
    { src: "/", dest: "/index.html" },
    { src: "/(.*)", dest: "/not-found.html", status: 404 },
  ],
};
await writeFile(resolve(outDir, "vercel.json"), JSON.stringify(config, null, 2) + "\n");
await writeFile(resolve(outDir, "api-disabled.json"), JSON.stringify({ error: "NAVIGATION_REVIEW_ONLY", message: "This review does not provide business APIs." }) + "\n");
await writeFile(resolve(outDir, "not-found.html"), '<!doctype html><html lang="es"><meta charset="utf-8"><title>Ruta no disponible</title><h1>Ruta no disponible</h1><a href="/hub">Volver al Hub</a></html>\n');
await writeFile(resolve(outDir, "robots.txt"), "User-agent: *\nDisallow: /\n");
const index = await readFile(resolve(outDir, "index.html"), "utf8");
if (!index.includes("OSi Plus") || index.includes("/src/")) throw new Error("The review build did not produce its static entry.");
console.log("Static navigation review built. No App/auth/API modules or operational data included.");
