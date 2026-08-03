# Propuesta de PR — Cadena canónica DB-01 y MT-01A

## Objetivo

Incorporar la cadena canónica experimental de Prisma, la fundación multiempresa MT-01A y los servicios persistentes DB-01D a DB-01J, manteniendo todas las integraciones desactivadas por defecto.

## Alcance incluido

- Baseline canónico y archivo histórico verificable.
- Tenant y TenantMembership sin convertirlos todavía en autoridad de autenticación.
- Auditoría comercial, aprobaciones, riesgo, excepciones y adendas.
- Geografía logística, reglas de zonas, flota, configuración de vehículos y cajas.
- Pruebas locales, controles de aislamiento, documentación y runbooks.

## Fuera de alcance

- MT-01B, autenticación, JWT o cambio de RBAC activo.
- Activación SHADOW o ENFORCED.
- Endpoints productivos o despliegue.
- `evaluatorPhoto.ts`, QuoteBuilder, SalesQuoteWorkspace, SeedData y demás trabajo ajeno.
- Datos, dumps, credenciales, URLs productivas o archivos `.env`.

## Evidencia de no regresión

La comparación entre HEAD limpio y HEAD más DB-01 produjo cero errores nuevos de build, TypeScript o ESLint. Los 448 errores TypeScript y el fallo de módulos ausentes en `UsersModule.tsx` son preexistentes e idénticos en ambos entornos. Las 252 pruebas DB-01/MT-01A y las 16 pruebas de dominio pasaron.

## Limitación obligatoria antes de integrar

La rama base no compila limpiamente porque `UsersModule.tsx` ya referencia módulos que no existen en HEAD, entre ellos `evaluatorPhoto.ts`. Estos defectos deben resolverse en una rama separada. DB-01 no debe incorporar esos archivos para hacer pasar artificialmente el build.

## Despliegue

Este PR no autoriza producción. La adopción requiere posteriormente una aprobación administrativa específica y la ejecución controlada del runbook DB-01M.
