import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vite = readFileSync('vite.config.ts', 'utf8');
const environment = readFileSync('src/lib/env.ts', 'utf8');
const api = readFileSync('src/lib/api.ts', 'utf8');
const login = readFileSync('src/components/auth/LoginScreen.tsx', 'utf8');

assert.match(vite, /target:\s*resolveLocalApiProxy\(\)/);
assert.match(vite, /'http:\/\/127\.0\.0\.1:3000'/);
assert.doesNotMatch(vite, /target:[\s\S]{0,120}osi-plus(?:-erp-v17)?\.vercel\.app/);
assert.match(vite, /parsed\.hostname !== '127\.0\.0\.1'/);
assert.match(vite, /parsed\.port !== '3000'/);
assert.match(vite, /changeOrigin:\s*false/);
assert.match(environment, /\["localhost", "127\.0\.0\.1", "::1"\]/);
assert.match(api, /LOCAL_API_CONFIGURATION_INVALID/);
assert.match(api, /API_CONNECTION_UNAVAILABLE/);
assert.match(login, /status === 401[\s\S]*'Credenciales inválidas'/);
assert.match(login, /status === 503[\s\S]*'El servicio de autenticación no está disponible'/);
assert.match(login, /LOCAL_API_CONFIGURATION_INVALID[\s\S]*'La configuración local de la API es inválida'/);
assert.match(login, /API_CONNECTION_UNAVAILABLE[\s\S]*'No fue posible conectar con la API'/);
process.stdout.write(JSON.stringify({ ok: true, localProxy: '127.0.0.1:3000', productionFallback: false, errorsSeparated: true }));
