# Almacenes20E — Localidad y etiqueta de ubicación

## Resultado

La ficha de cada almacén permite asignar una localidad persistente. El listado agrupa los almacenes por localidad, permite filtrarlos y encuentra tanto las etiquetas nuevas como los códigos anteriores.

Ejemplos del formato solicitado:

- `S1-ALM4-000-00-AA-02-0`.
- `S1-ALM2-GM1-01-AB-03-0`.

La estructura es **Localidad → Almacén → Zona → Pasillo → Estantería → Nivel → Posición**. Los almacenes continúan siendo registros independientes. La localidad agrupa esos registros; no crea una zona interior que mezcle almacenes.

## Uso

1. Abrir **Almacenes → Espacios** y editar la hoja del almacén.
2. Indicar el número de **Localidad**: `1` representa `S1`. Una ficha nueva propone 1; las fichas anteriores permanecen sin asignación hasta que una persona la guarda expresamente.
3. Crear o reutilizar los recorridos. El nivel acepta `02` y se muestra con dos dígitos; la posición `0` expresa que no existe esa subdivisión.
4. Guardar la hoja. Al volver al listado y recargar, la localidad y la etiqueta se obtienen de la base de datos. El número automático de un almacén nuevo se confirma al guardar, nunca en una vista previa provisional.

El campo vacío permite conservar un almacén sin localidad. Los números de localidad admitidos son 1–999. La numeración de almacén conserva el rango existente 1–99 y su unicidad por empresa. Los niveles conservan el rango 1–9; `00` indica omisión. No se crea un catálogo ficticio de localidades ni se asigna `S1` automáticamente a registros anteriores.

## Identidad y compatibilidad

`WarehouseSheetProfile.localityNumber` es nullable y se actualiza en la misma transacción, control de versión, permisos y auditoría que la hoja.

`WarehouseLocationAddress.label` mantiene su identidad histórica inmutable. Para una dirección ya existente:

```text
label:        ALM-04-000-00-AA-2-0
displayLabel: S1-ALM4-000-00-AA-02-0
```

La presentación nueva deriva de la localidad realmente guardada y de los segmentos de la dirección. No se renumeran artículos, almacenes ni ubicaciones; se conservan UUID, códigos, paths, relaciones, movimientos y recibos. La identidad de un artículo permanece separada de su ubicación.

`localityNumber` es opcional en comandos y respuestas. Su ausencia en un comando antiguo se mantiene como ausencia, sin añadir `null` ni cambiar el hash. Un `null` explícito quita la asignación; omitir el campo conserva el valor actual. Los reintentos recuperan el recibo almacenado exacto. El cliente acepta recibos anteriores y exige confirmar la localidad cuando el comando sí la incluye.

El nivel visual `02` se normaliza al identificador canónico `2`, para reutilizar las ubicaciones existentes. El formateador histórico y sus validaciones de BD no cambian.

Los selects del perfil son explícitos: con 20E apagado, el cliente Prisma 41 puede leer y crear perfiles en una BD 40 que todavía no tiene `locality_number`.

## Migración 41

Nueva migración: `20261102020000_v17_warehouse_localities`.

Añade únicamente:

- Columna nullable `warehouse_sheet_profiles.locality_number INTEGER`, sin default.
- CHECK que permite `NULL` o enteros 1–999.

No contiene backfill, actualización de filas ni reemplazo de funciones o triggers. Las migraciones anteriores y sus checksums permanecen intactos.

Las capturas independientes en PostgreSQL 17.11 y 18.6 comparan catálogo, historial aplicado, extensiones y huellas de todas las tablas antes y después. En PostgreSQL 18 se probó sobre 6 almacenes, 30 ubicaciones, 26 direcciones y 17 recibos ya guardados, creados por la suite de recorridos 20D. La huella de todos esos registros se conservó exactamente.

El catálogo canónico PostgreSQL 18 posterior tiene 10831 objetos y SHA256 `d54f35d6141505bbe9e4e118718fcfc953dd9eecb06ad5212c94b69b39a9a862`. El catálogo 40 permanece congelado como checkpoint histórico.

## Activación Preview

El destino operativo sigue siendo el proyecto existente y su rama `feature/v17-consolidated-preview`. El hook valida base `v17_consolidated_preview_10b`, esquema `osi`, rama Neon `br-mute-credit-ahxnvfx0`, tenant esperado, historial completo y commit exacto.

1. Integrar el candidato validado en la rama consolidada con 20E apagado.
2. Configurar `V17_WAREHOUSE_LOCALITIES_PREVIEW_MIGRATION=CHECK:<commit>` únicamente en Preview de esa rama.
3. Revisar el resultado: la única migración pendiente debe ser 41. Conservar la huella y el conteo del catálogo anterior.
4. Ejecutar `APPLY:<commit>:<sha256-catalogo-anterior>:<conteo>`. El hook usa `prisma migrate deploy`, verifica el estado posterior y conserva la extensión histórica ya documentada sin afirmar que su SQL haya sido auditado.
5. Dejar el hook en `DISABLED`.
6. Habilitar API y UI con modo `PREVIEW_REHEARSAL` y batch `V17-WAREHOUSE-LOCALITIES-20E-PREVIEW`.
7. Verificar el nuevo despliegue, commit, alias, carga de interfaz y respuesta de las rutas.

Variables nuevas:

```text
WAREHOUSE_LOCALITIES_API_MODE
WAREHOUSE_LOCALITIES_API_BATCH
VITE_WAREHOUSE_LOCALITIES_UI_MODE
VITE_WAREHOUSE_LOCALITIES_UI_BATCH
V17_WAREHOUSE_LOCALITIES_PREVIEW_MIGRATION
```

La capacidad depende de los gates de recorridos 20D, hoja 20C y sus dependencias. Un campo de localidad enviado mientras 20E está apagado se rechaza. Los hooks históricos rechazan fuentes con migraciones posteriores y deben permanecer apagados.

## Verificación

Las suites cubren los dos ejemplos exactos, localidad inválida, `null` frente a ausencia, recuperación de borradores, comandos/recibos anteriores, persistencia después de leer de nuevo, concurrencia/versiones, aislamiento por empresa, continuidad de códigos y direcciones, búsqueda nueva e histórica y funcionamiento con el esquema 40.

Los ensayos de navegador 20E se ejecutan en CI para escritorio y móvil. Las descargas del navegador en el entorno local devolvieron archivos truncados; esa limitación se registra separadamente de los resultados de código, contrato y BD. La PR y sus checks constituyen la evidencia de ejecución del navegador.

Resultados locales antes de la PR: 85/85 pruebas 20E de contrato, cliente y migración; 10/10 pruebas de persistencia en PostgreSQL 17; 9 pruebas de persistencia en PostgreSQL 18 y 1 replay histórico reservado a CI; 195/195 verificaciones del catálogo SQL, 37/37 de inventario y 21/21 del guard de autenticación. El replay histórico 40→41 sí se ejecutó con éxito en PostgreSQL 17. Las regresiones de clientes 20C (18) y 20D (24) también pasan.
