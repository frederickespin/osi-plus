import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve(".tool-access-dist");
const config = JSON.parse(await readFile(resolve(root, "vercel.json"), "utf8"));
const headers = config.routes[0].headers;
const pages = new Set(["/", "/hub", "/quotation-tools", "/mobile-processes"]);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, headers); res.end(); return; }
    const pathname = new URL(req.url, "http://127.0.0.1").pathname.replace(/\/$/, "") || "/";
    let status = 200;
    let file = pages.has(pathname) ? "index.html" : decodeURIComponent(pathname.slice(1));
    if (/^\/api(?:\/|$)/.test(pathname)) { file = "api-disabled.json"; status = 404; }
    let absolute = resolve(root, file);
    if (!absolute.startsWith(root + sep)) { res.writeHead(404, headers); res.end(); return; }
    let body;
    try { body = await readFile(absolute); }
    catch { absolute = resolve(root, "not-found.html"); body = await readFile(absolute); status = 404; }
    res.writeHead(status, { ...headers, "Content-Type": types[extname(absolute)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { res.writeHead(400, headers); res.end(); }
});
server.listen(4198, "127.0.0.1", () => console.log("Navigation review ready at http://127.0.0.1:4198/hub"));
