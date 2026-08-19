import assert from "node:assert/strict";
import { resolveAppEnvironment } from "../shared/appEnvironment.js";

const cases = [
  ["Vercel Preview", { vercelEnvironment: "preview", hostname: "preview.example.invalid" }, "preview"],
  ["VITE Preview soportado", { appEnvironment: "preview", hostname: "preview.example.invalid" }, "preview"],
  ["Vercel Production", { vercelEnvironment: "production", hostname: "app.example.invalid" }, "production"],
  ["localhost", { appEnvironment: "production", vercelEnvironment: "production", hostname: "localhost" }, "development"],
  ["IPv4 loopback", { hostname: "127.0.0.1" }, "development"],
  ["IPv6 loopback", { hostname: "[::1]" }, "development"],
  ["ausente", { hostname: "unknown.example.invalid" }, "unknown"],
  ["VITE production sin Vercel", { appEnvironment: "production", hostname: "unknown.example.invalid" }, "unknown"],
  ["Vercel desconocido", { vercelEnvironment: "staging", hostname: "unknown.example.invalid" }, "unknown"],
  ["señales en conflicto", { appEnvironment: "preview", vercelEnvironment: "production", hostname: "app.example.invalid" }, "unknown"],
  ["casing", { appEnvironment: "Preview", hostname: "preview.example.invalid" }, "unknown"],
  ["whitespace", { appEnvironment: " preview", hostname: "preview.example.invalid" }, "unknown"],
  ["comillas", { appEnvironment: '"preview"', hostname: "preview.example.invalid" }, "unknown"],
  ["BOM", { appEnvironment: "\ufeffpreview", hostname: "preview.example.invalid" }, "unknown"],
  ["CR/LF", { appEnvironment: "preview\r\n", hostname: "preview.example.invalid" }, "unknown"],
  ["hostname parecido", { hostname: "localhost.example.invalid" }, "unknown"],
];

for (const [name, input, expected] of cases) {
  assert.equal(resolveAppEnvironment(input), expected, name);
}

console.log(JSON.stringify({ ok: true, assertions: cases.length, productionFallback: false }));
