# HR/NOTA V2

## Objetivo
Implementar HR/NOTA V2 manteniendo la persistencia actual de usuarios (`osi-plus.users`) y sin usar `react-router`.

## Tipos y catálogos
- `src/types/hr-nota-v2.types.ts`: modelos V2 (CB/SHAB, eventos NOTA, allowances).
- `src/data/seeds-hr-nota-v2.ts`: catálogos CB/SHAB/NOTA/Allowances.

## Persistencia localStorage
Claves nuevas:
- `osi-plus.catalogs.hr-nota-v2`
- `osi-plus.osi` (incluye `osiNotaPlan`, `notaEvents[]`, `allowances[]`)

Usuarios se mantienen en:
- `osi-plus.users`

Helpers:
- `src/lib/hrNotaStorage.ts` (`load/saveCatalogs`, `load/saveOsi`, `load/saveAllowances`)
- `src/lib/userStore.ts` (normalización + migración V1 -> V2)

## Migración V1 -> V2
Se ejecuta en `loadUsers()`:
- `baseQualifications` por defecto a `CB01..CB06` con `NA`.
- `shab` desde `shabActive` o `skills` si existían.
- `notaEnabled` se conserva para compatibilidad de UI.

## Flujo V2
- **Ventas/Coordinador (V/K)**: define `osiNotaPlan` y `allowances` en `OSI`.
- **Supervisor (D)**: registra eventos del plan en `OSI.notaEvents[]` (status `REGISTRADO`) y extras (`PENDIENTE_V`).
- **Ventas (V)**: aprueba/rechaza extras.

## UI mínima
Módulos creados:
- `HumanResourcesModule` (RRHH: CB/SHAB)
- `OSIModule` (Plan NOTA + Allowances)
- `SupervisorNotaModule` (registro de eventos)
- `SalesApprovalsModule` (aprobaciones V)

## Notas
- `notaEnabled` solo controla visibilidad de NOTA en UI para roles de campo.
- El cálculo de elegibilidad se realiza con `isEligibleForEvent()` en `src/lib/hrNotaV2.ts`.
