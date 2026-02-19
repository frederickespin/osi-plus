# Auditoría de seguridad – OSi-plus

**Fecha de revisión:** Febrero 2025  
**Alcance:** `src/`, `api/`, `prisma/`, configuración y dependencias.  
**Nota:** Esta revisión es preventiva; no sustituye un pentest ni una auditoría externa para compliance.

---

## 1. Resumen ejecutivo

| Nivel de riesgo global | **Medio** |
|------------------------|-----------|
| **Crítico**            | 1 (JWT_SECRET por defecto en desarrollo) |
| **Alto**               | 2 (XSS en plantillas HTML; exposición de passwordHash en POST /api/users) |
| **Medio**              | 3 (credenciales de demo en frontend; token en localStorage; dependencias dev) |
| **Bajo**               | Varios (documentados abajo) |

No se detectó código malicioso (eval, Function, backdoors). La autenticación usa JWT y los endpoints sensibles están protegidos con `requireAuth` + `requirePerm`. Las mejoras recomendadas se centran en secretos, XSS y exposición de datos.

---

## 2. Hallazgos por categoría

### 2.1 Credenciales y secretos

| Id | Severidad | Descripción | Ubicación |
|----|-----------|-------------|-----------|
| C1 | **Crítico** (solo si se despliega sin config) | `JWT_SECRET` tiene valor por defecto `"dev-insecure-secret"` cuando `process.env.JWT_SECRET` no está definido. En producción debe estar siempre definido. | `api/_lib/auth.js` línea 4 |
| C2 | **Medio** | Usuarios de prueba con contraseñas en texto plano en el frontend (Admin123*, Demo123*, Ventas123*). Solo aceptable en desarrollo/demo; en producción no deberían cargarse o deberían venir de variables de entorno. | `src/components/auth/LoginScreen.tsx` líneas 14-19 |
| C3 | Bajo | El seed de Prisma usa las mismas contraseñas (Admin123*, Demo123*, Ventas123*) para usuarios de prueba. Coherente con desarrollo/preview; documentar que no se debe usar en producción sin cambiar contraseñas. | `prisma/seed.mjs` |
| C4 | Bajo | `.env.example` solo contiene placeholders; no hay secretos reales. `.env` está listado en `.gitignore` (verificado). | `.env.example`, `.gitignore` |

**Recomendaciones:**  
- En producción, exigir `JWT_SECRET` (fallar el arranque si no existe).  
- En producción, no exponer el bloque de credenciales de demo en `LoginScreen` (ocultar por env o eliminar).  
- Mantener documentación clara sobre uso del seed solo en dev/preview.

---

### 2.2 Autenticación y sesión

| Id | Severidad | Descripción | Ubicación |
|----|-----------|-------------|-----------|
| A1 | **Medio** | El token JWT se guarda en `localStorage` y se envía en cabecera `Authorization: Bearer`. Si hay XSS, un script puede robar el token. Mitigaciones: CSP, sanitización, y a largo plazo considerar token en httpOnly cookie. | `src/lib/sessionStore.ts`, `src/lib/api.ts` |
| A2 | Bajo | Login no expone `passwordHash` en la respuesta; solo devuelve datos de usuario necesarios. | `api/auth/login.js` |
| A3 | Bajo | Endpoints sensibles (`/api/users`, `/api/clients`, `/api/projects`, `/api/osis`) usan `requireAuth` + `requirePerm` correctamente. | `api/users/index.js`, `api/clients/index.js`, `api/projects/index.js`, `api/osis/index.js` |
| A4 | Bajo | Extracción del Bearer y verificación JWT están centralizadas en `requireAuth.js` y `auth.js`; no se encontró uso de cabeceras custom inseguras para autenticación. | `api/_lib/requireAuth.js`, `api/_lib/auth.js` |

**Recomendaciones:**  
- Mantener buenas prácticas de sanitización y CSP para reducir riesgo de robo de token.  
- Valorar migración a cookie httpOnly para el token en una fase posterior.

#### Riesgo de token en localStorage y plan httpOnly cookie

- **Riesgo:** El JWT se guarda en `localStorage` (`osi-plus.token`) y se envía en la cabecera `Authorization: Bearer`. Cualquier script que se ejecute en el mismo origen (p. ej. por un XSS) puede leer `localStorage` y robar el token, suplantando al usuario hasta que expire el JWT.
- **Mitigaciones actuales:** Sanitización de HTML (DOMPurify) en vistas con contenido editable, y recomendación de no exponer credenciales de prueba en producción.
- **Plan a medio plazo (httpOnly cookie):**
  1. El backend, tras login válido, en lugar de (o además de) devolver el token en JSON, fijaría una cookie `httpOnly`, `Secure`, `SameSite=Strict` con el JWT.
  2. El frontend no leería ni escribiría el token; las peticiones a la API enviarían la cookie automáticamente (con `credentials: 'include'`).
  3. Cerrar sesión = endpoint que borra la cookie (o cookie con expiración corta y refresh token en httpOnly).
  4. Requiere que la API y el front compartan el mismo dominio (o configuración CORS/cookie correcta en subdominios).

---

### 2.3 XSS e inyección

| Id | Severidad | Descripción | Ubicación |
|----|-----------|-------------|-----------|
| X1 | **Alto** (mitigado) | `dangerouslySetInnerHTML` con contenido editable por el usuario. **Aplicado:** Se sanitiza con DOMPurify antes de renderizar. | `src/components/modules/TemplatesCenterModule.tsx` |
| X2 | **Alto** (mitigado) | Mismo patrón en editor de plantillas PIC. **Aplicado:** Se sanitiza con DOMPurify antes de renderizar. | `src/components/modules/TemplateEditorModule.tsx` |
| X3 | Bajo | `dangerouslySetInnerHTML` en el componente de gráficos usa contenido estático (THEMES). No hay vector de inyección desde usuario. | `src/components/ui/chart.tsx` ~líneas 83-84 |

No se encontraron usos de `eval()`, `new Function()`, `innerHTML` directo ni `document.write` en el alcance revisado. No hay consultas SQL raw con concatenación de entrada de usuario (Prisma parametriza).

**Recomendaciones:**  
- Sanitizar HTML antes de pasarlo a `dangerouslySetInnerHTML`.  
- **Aplicado:** Se usa DOMPurify en TemplatesCenterModule y TemplateEditorModule para sanitizar `htmlPreview` y `picBodyHtml` antes de renderizar.

---

### 2.4 Exposición de datos

| Id | Severidad | Descripción | Ubicación |
|----|-----------|-------------|-----------|
| E1 | **Alto** (aplicado) | En `POST /api/users`, la respuesta ya no incluye `passwordHash`; se devuelve solo el subconjunto de campos seguros (id, code, name, email, phone, role, status, etc.). | `api/users/index.js` |
| E2 | Bajo | `GET /api/users` mapea explícitamente los campos devueltos y no incluye `passwordHash`. | `api/users/index.js` líneas 29-41 |

**Recomendación:**  
- En `POST /api/users`, no devolver el objeto completo; devolver los mismos campos que en GET (id, code, name, email, phone, role, status, etc.) y excluir `passwordHash`.  
- **Aplicado:** La respuesta de `POST /api/users` ya no incluye `passwordHash`; se devuelve solo el subconjunto de campos seguros.

---

### 2.5 Dependencias

| Id | Severidad | Descripción |
|----|-----------|-------------|
| D1 | **Medio** | `npm audit` reporta 11 vulnerabilidades (1 moderada, 10 altas), todas en **devDependencies**: eslint, typescript-eslint, minimatch, ajv (ReDoS). No afectan al runtime de producción. |
| D2 | Bajo | Paquetes sensibles de producción (jsonwebtoken, bcryptjs) se usan de forma correcta: JWT con secret de env, bcrypt para hashes; no se encontró logueo de tokens o contraseñas. |

**Recomendaciones:**  
- Actualizar eslint y typescript-eslint cuando sea posible (cambios major; revisar breaking changes).  
- Ejecutar `npm audit` de forma periódica y priorizar parches en dependencias de producción si aparecen en el futuro.

---

### 2.6 Red y configuración

| Id | Severidad | Descripción |
|----|-----------|-------------|
| N1 | Bajo | `API_BASE` en el frontend viene de `import.meta.env.VITE_API_URL` (por defecto `/api`). No hay URLs internas sensibles hardcodeadas. |
| N2 | Bajo | Proxy de Vite apunta a `VITE_API_PROXY` o a `https://osi-plus.vercel.app`; adecuado para desarrollo. |
| N3 | Bajo | No se detectó envío de token ni datos sensibles en query strings en el código revisado. |

---

## 3. Recomendaciones priorizadas

1. **Crítico:** Asegurar que en producción `JWT_SECRET` esté siempre definido (y no usar el valor por defecto).  
2. **Alto:** Sanitizar HTML (o usar canal seguro) antes de usar `dangerouslySetInnerHTML` en TemplatesCenterModule y TemplateEditorModule.  
3. **Alto:** En `POST /api/users`, no devolver `passwordHash`; devolver solo los campos necesarios (igual que en GET).  
4. **Medio:** En producción, no mostrar o no cargar las credenciales de demo del LoginScreen.  
5. **Medio:** Documentar el riesgo de token en localStorage y planificar (a medio plazo) opciones como httpOnly cookie.  
6. **Bajo:** Actualizar dependencias de desarrollo según `npm audit` cuando sea viable.

---

## 4. Referencias rápidas

- Auth: `api/_lib/auth.js`, `api/_lib/requireAuth.js`, `api/auth/login.js`
- Sesión frontend: `src/lib/sessionStore.ts`, `src/lib/api.ts`
- XSS: `src/components/modules/TemplatesCenterModule.tsx`, `src/components/modules/TemplateEditorModule.tsx`
- Usuarios API: `api/users/index.js`
- Credenciales demo: `src/components/auth/LoginScreen.tsx`, `prisma/seed.mjs`

---

## 5. Estado de las recomendaciones priorizadas

| # | Prioridad | Recomendación | Estado |
|---|-----------|---------------|--------|
| 1 | Crítico | JWT_SECRET obligatorio en producción | **Aplicado:** En `api/_lib/auth.js` se lanza un error al cargar el módulo si `VERCEL_ENV` o `NODE_ENV` es production y JWT_SECRET no está definido o es el valor por defecto. |
| 2 | Alto | Sanitizar HTML en TemplatesCenter y TemplateEditor | **Aplicado:** DOMPurify sanitiza el HTML antes de `dangerouslySetInnerHTML`. |
| 3 | Alto | POST /api/users sin passwordHash | **Aplicado:** La respuesta devuelve solo campos seguros. |
| 4 | Medio | No mostrar credenciales de demo en producción | **Aplicado:** El bloque "Credenciales para probar roles" en LoginScreen solo se muestra cuando `getAppEnv() !== "production"`. |
| 5 | Medio | Documentar riesgo localStorage y plan httpOnly | **Aplicado:** Sección "Riesgo de token en localStorage y plan httpOnly cookie" en este documento (apartado 2.2). |
| 6 | Bajo | Actualizar dependencias de desarrollo (npm audit) | **Documentado:** Las 11 vulnerabilidades están solo en devDependencies (eslint, typescript-eslint, minimatch, ajv). `npm audit fix` no las corrige sin breaking changes; para resolverlas hace falta `npm audit fix --force` (eslint@10) o actualizar manualmente. Opcional según impacto en la configuración de lint. |
