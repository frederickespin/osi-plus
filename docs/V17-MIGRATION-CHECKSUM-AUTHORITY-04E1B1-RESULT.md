# V17-MIGRATION-CHECKSUM-AUTHORITY-04E1B1 — Reconciliación

## Conclusión

Los dos SHA-256 de cada migración representan el mismo texto SQL con finales de línea distintos. Los blobs Git publicados usan LF, sin BOM. El checkout Windows usado por el ensayo 04E1B tenía `core.autocrlf=true` y materializó esos mismos blobs con CRLF. Prisma calculó y almacenó el checksum de los bytes CRLF que recibió durante ese ensayo temporal.

La diferencia de tamaño confirma la transformación exactamente: 217 bytes adicionales en la migración 19, 33 en la 20 y 96 en la 21, uno por cada LF convertido a CRLF. No existe diferencia semántica ni modificación silenciosa del SQL.

## Matriz binaria

| Migración | Commit originador | Git originador / PR #61 / Linux limpio | Bytes LF | LF | BOM | Windows antes de normalizar / Prisma ensayo | Bytes CRLF | CRLF |
|---|---|---|---:|---:|---|---|---:|---:|
| 19 — `20260824010000_v17_client_public_ref_case_mutations` | `477eabc5acc61af8338faa8b8aea34c7e2efc9a5` | `dbb093f15eb2ee708328518dcf19e52fd8b0623fbc893cec1a001cf819a6da70` | 10,776 | 217 | No | `b19cff2e930ef0db22e454d6feebe52d31069ba7e23e1452b43783f9aaa36902` | 10,993 | 217 |
| 20 — `20260827010000_v17_tenant_membership_public_ref` | `2257f5227eea5e3a6eb360c87207fe609f714e3e` | `b1284e443778ad1c7336d7703c9478ac09215b81a00f6b09bad48ceba6d5051c` | 1,165 | 33 | No | `aa21af85d5d6ab78a2ad45002571d61a359fb87d5476b30e2d766607cecf51e7` | 1,198 | 33 |
| 21 — `20260827020000_v17_admin_identity_invitation` | `0e2106fcebc8caac3e94750a37181ec50010e276` | `9ee56aaee53d5629db8dada22bcf86511d10c837c4ad61fb37fbd0b4caf53808` | 5,292 | 96 | No | `fd3040e67eb04c46cc1d09d2bb560c875ac50f113794af2819760fb39255047c` | 5,388 | 96 |

La columna Linux se valida en un checkout limpio de GitHub Actions. Los bytes del working tree Windows después de aplicar la política LF son idénticos al blob Git y, por tanto, producen el mismo SHA-256 canónico.

## Método de cada valor

- Migración 19 anterior: `Get-FileHash -Algorithm SHA256` sobre `migration.sql`; la invocación original permanece registrada y el archivo estaba en LF.
- Migración 20 anterior: no quedó una traza del comando original junto al valor reportado. La auditoría binaria lo reproduce exactamente con SHA-256 sobre el blob Git LF del commit originador. Por tanto se conoce el contenido que produjo el valor, pero no se atribuye retrospectivamente una utilidad de consola no demostrada.
- Migración 21 anterior: `Get-FileHash -Algorithm SHA256` sobre `migration.sql`; la invocación original permanece registrada y el archivo estaba en LF.
- Los valores del ensayo fueron calculados sobre los archivos materializados con CRLF en Windows. Prisma 6.16.2 almacenó esos mismos valores en `_prisma_migrations.checksum`; la verificación `READ ONLY` del ensayo comparó los tres registros de Prisma contra esos hashes exactos.
- La auditoría actual lee bytes sin normalización: `git show <commit>:<path>` para el blob, `readFileSync` para el working tree y SHA-256 binario de esos buffers. EOL y BOM se determinan inspeccionando los bytes `0d 0a`, `0a`, `0d` y `ef bb bf`.

## Inmutabilidad Git

- PR #59 añadió únicamente la migración 20; la migración 19 conserva byte a byte el blob del PR #58.
- PR #60 añadió únicamente la migración 21; las migraciones 19 y 20 no cambiaron.
- PR #61 no modificó ninguna de las tres migraciones.
- `git diff` entre cada PR sucesivo y los commits originadores confirma cero ediciones posteriores de un `migration.sql` ya publicado.

No se restauró ni reescribió ningún archivo SQL porque no existe una diferencia real en Git.

## Política y guardia

El repositorio fija ahora una única política:

```gitattributes
prisma/migrations/**/*.sql text eol=lf
```

La guardia comprueba en el árbol actual:

1. Regla `.gitattributes` exacta y única.
2. Las 21 migraciones con LF y sin BOM.
3. Igualdad byte a byte entre working tree y blob `HEAD`.
4. SHA-256 canónicos de las migraciones 19–21.
5. Negativas para regla ausente/duplicada, CRLF, BOM, divergencia del blob y checksum alterado.

El ensayo Neon era temporal y fue eliminado. Production no fue consultada ni modificada durante esta reconciliación. Antes de aplicar 19–21 a cualquier ambiente persistente, el checkout que ejecute Prisma debe superar esta guardia LF; no debe aceptarse el checksum CRLF del ensayo como autoridad del repositorio.
