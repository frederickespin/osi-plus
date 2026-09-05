# V17 Preview Environment 10B

Este documento registra el mecanismo local y aislado que provisiona la Preview
consolidada. No contiene credenciales ni valores de entorno.

## Autoridad

- Rama: `feature/v17-consolidated-preview`.
- Base aprobada: `a0d30106ee4097d818c94ad9ac902c3bde62e9b3`.
- Migraciones: 1 a 29; no existe migracion 30.
- Modo: `PREVIEW_REHEARSAL`; `productionApiEnabled=false`.
- Auth: LEGACY; Auth V2 permanece desactivado.

## Provisionamiento seguro

- `npm run seed:v17-consolidated-preview` carga exactamente cuatro escenarios
  sinteticos en una base Preview vacia y aislada.
- `npm run guard:v17-consolidated-preview-seed` verifica el cierre ante Production,
  la identidad de la base y la rama Neon antes de cualquier escritura.
- `npm run verify:v17-consolidated-preview-db` valida 29/29, checksums y que la tabla
  de migraciones exista exclusivamente en el schema `osi`.

Las credenciales sintéticas se conservan únicamente en el archivo local ignorado
`.env.v17-consolidated-preview-10b.local`, protegido por ACL. Production, sus aliases,
variables, base y storage quedan fuera del alcance de este entorno.
