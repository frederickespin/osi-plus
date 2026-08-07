# INC-C1B2B-01 — Ejecución accidental del runner contra una rama remota

## Resumen

Una suite sintética de MT-01C1B2B tomó la conexión general del proceso antes de comprobar que el destino fuera PostgreSQL local. El runner importaba e instanciaba Prisma durante la carga del módulo y no exigía una variable exclusiva de pruebas.

## Alcance confirmado

La auditoría protegida identificó únicamente datos sintéticos del run afectado:

- 2 tenants.
- 11 usuarios.
- 11 membresías.
- 34 solicitudes de aprobación.
- 34 solicitudes de provisión.
- 6 propuestas de rol administrativo.
- 122 auditorías.

No se encontraron perfiles, invitaciones, sesiones de autenticación, refresh tokens, cambios de esquema ni alteraciones a migraciones. Tampoco existían referencias desde datos operativos hacia las filas sintéticas.

## Contención y limpieza

Se creó y verificó un respaldo aislado antes de limpiar. Un manifiesto local no versionado fijó las PK y hashes exactos. La limpieza eliminó 220 filas sintéticas en una sola transacción, revalidó los hashes bajo lock y conservó activos los triggers append-only.

Los fingerprints normalizados posteriores coincidieron con los valores anteriores al incidente:

- Identidad: `603cd572…50e1`.
- Comercial: `2f13b9e8…17eea9`.
- Estructura: `1943c90e…e646`.
- Historial: `548bf082…f1526`.

El manifiesto y el SQL administrativo permanecen fuera del repositorio.

## Prevención incorporada

La suite ahora exige exclusivamente `MT01C1B2B_TEST_DATABASE_URL` y valida antes de importar Prisma:

- Protocolo PostgreSQL.
- Host exacto `127.0.0.1`.
- Puerto `55432`.
- Base incluida en una allowlist local explícita.
- `schema=osi`.
- Credenciales sintéticas presentes.
- Ausencia de Neon, poolers y flags de override.

Después de conectar y antes de escribir, vuelve a comprobar base, dirección, puerto, esquema y ausencia de `neon.branch_id`. El runner canónico transfiere explícitamente su destino local ya validado y sólo imprime identidad sanitizada.

Las pruebas negativas impiden reintroducir fallbacks a `DATABASE_URL`, `DIRECT_URL`, archivos de entorno generales o mecanismos de bypass.
