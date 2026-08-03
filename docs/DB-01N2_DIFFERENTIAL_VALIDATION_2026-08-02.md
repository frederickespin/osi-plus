# DB-01N2 — Validación diferencial y commits locales

Fecha: 2026-08-02
Rama candidata: `chore/db01-canonical-migrations`
HEAD base: `58a0db6fe937a25ba0e861b3a8de260cf7ff66d4`

## Alcance y aislamiento

La validación se ejecutó en dos worktrees independientes:

- Base limpia detached: `C:\Users\espin\osi-plus-v17\osi-plus-erp-v17-db01-base`.
- Candidato DB-01: `C:\Users\espin\osi-plus-v17\osi-plus-erp-v17-db01-canonical`.

No se copió `evaluatorPhoto.ts`, no se modificó el árbol original y no se accedió a producción. La base de datos utilizada fue PostgreSQL local en `127.0.0.1:55432`, base sintética `osi_db01n_clean_20260802`, esquema `osi`.

## Defecto heredado demostrado por Git

El objeto `HEAD:src/components/modules/UsersModule.tsx` contiene desde el commit base:

```ts
import { compressPhotoFile } from '@/modules/evaluator-app/utils/evaluatorPhoto';
```

Git confirma simultáneamente que:

- `src/modules/evaluator-app/utils/evaluatorPhoto.ts` no existe en HEAD.
- En el árbol original aparece únicamente como `A  src/modules/evaluator-app/utils/evaluatorPhoto.ts`.
- `git diff -- src/components/modules/UsersModule.tsx` está vacío en el candidato.
- DB-01 no agregó ni modificó ese import.

Existe además otro módulo ausente ya referenciado por el mismo archivo en HEAD: `@/lib/operationalCompensationStore`. Vite encuentra este primero y finaliza allí; TypeScript informa ambos con `TS2307` en Base y Candidato.

## Comparación Base contra Candidato

Los diagnósticos TypeScript y ESLint se normalizaron por archivo, línea, columna, código y mensaje, sustituyendo la raíz específica de cada worktree.

| Control | Base | Candidato | Regresión |
|---|---:|---:|---:|
| Build | Falla heredada | Misma falla heredada | 0 |
| TypeScript `tsc -b` | 448 errores | 448 errores | 0 |
| TypeScript `tsc --noEmit` | 0 | 0 | 0 |
| ESLint errores | 2,881 | 2,881 | 0 |
| ESLint advertencias | 4,408 | 4,416 | +8 |
| `git diff --check` | Correcto | Correcto | 0 |

Las ocho advertencias adicionales son `no-console` en scripts CLI de migración/prueba. No existen errores ESLint en archivos DB-01/MT-01A. Los conjuntos de 448 errores TypeScript son idénticos y no hay errores nuevos en archivos DB-01/MT-01A.

Los dos entornos reportan de forma idéntica:

- `UsersModule.tsx(43,8) TS2307`: falta `operationalCompensationStore`.
- `UsersModule.tsx(45,35) TS2307`: falta `evaluatorPhoto`.

## Validación de base de datos y dominio

Sobre una base local vacía:

- Primer `prisma migrate deploy`: 11 migraciones aplicadas.
- Segundo y tercer deploy: ninguna migración pendiente.
- `prisma validate`: correcto.
- `prisma generate`: correcto con Prisma 6.19.2.
- `prisma migrate status`: actualizado.
- `prisma migrate diff`: `-- This is an empty migration.`
- MT-01A: 18 usuarios sintéticos; primer backfill 18, segundo 0; 7/7 restricciones; rollback por lote y reaplicación correctos.
- DB-01D: 21/21.
- DB-01E: 37/37.
- DB-01F: 38/38.
- DB-01G: 47/47.
- DB-01H: 35/35.
- DB-01I: 36/36.
- DB-01J: 31/31.
- Total DB-01/MT-01A: 252/252.
- Dominio: 16/16 en cinco archivos.

DB-01I requirió que el arnés local proporcionara tanto `DATABASE_URL` como `DB01I_DATABASE_URL`; no se modificó código para ello.

## Feature flags y secretos

Los flags DB-01E, DB-01G, DB-01H y DB-01I estaban ausentes del entorno de prueba. Los adaptadores resolvieron `LEGACY_ONLY`; SHADOW y ENFORCED permanecieron deshabilitados y esto fue comprobado por las pruebas funcionales.

El escaneo no encontró endpoints Neon ni claves privadas. La única URL con credenciales estáticas está en `.github/workflows/ci.yml` y corresponde al ejemplo local deliberadamente ficticio del CI. No se incluyeron `.env`, dumps, bases o secretos.

## Limitación de integración

La rama base no compila limpiamente debido a módulos ausentes ya referenciados en HEAD y contiene 448 errores TypeScript preexistentes. DB-01 añade cero errores nuevos. La integración final debe realizarse sobre una rama donde esos defectos hayan sido resueltos separadamente, sin incorporar los archivos ajenos en esta rama.

## Organización de commits

1. `30dac76` — `chore(db): establish canonical prisma baseline`: datamodel consolidado, baseline, archivo histórico y configuración Prisma.
2. `a6d1d73` — `feat(tenant): add tenant membership foundation`: migración, backfill, rollback y pruebas MT-01A.
3. `f4926d3` — `feat(commercial): add audit approvals risk and change orders`: DB-01D a DB-01G.
4. `1900113` — `feat(logistics): add geography fleet and crate settings persistence`: DB-01H a DB-01J.
5. `test(docs): add migration validation and production runbooks`: CI focalizado, controles de esquema, evidencias y runbooks. El hash definitivo se obtiene del commit que contiene este informe.
