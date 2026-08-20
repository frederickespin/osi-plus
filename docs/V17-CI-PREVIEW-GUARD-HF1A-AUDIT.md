# V17-CI-PREVIEW-GUARD-HF1A — Auditoría

## Clasificación

`CI_GUARD_DESIGN_DEFECT`

La guardia anterior calculaba un diff contra el SHA histórico fijo
`e7128e170188c2fab93ebc5c2768a5e656cb510f` y comparaba cada ruta modificada con
una allowlist cerrada del PR #46. Por ello rechazaba documentación y cualquier
cambio futuro no relacionado. Además, `git show` y `git diff` convertían el
historial completo en una dependencia accidental, incompatible con checkouts
shallow que no contuvieran ese commit.

## Diseño corregido

La guardia inspecciona el árbol y el bundle actuales. No ejecuta Git, no usa un
SHA base y no clasifica cambios ajenos. Conserva las invariantes de seguridad:

- modos Hub, Inbox y CRM desactivados por defecto;
- rama y batch Preview exactos, sin normalización;
- Preview rechazado en Production/main y mutaciones siempre desactivadas;
- `deniedPermissions` evaluado antes del rol baseline;
- aliases `/commercial`, `/crm` y `/sales/pipeline` bajo una decisión común;
- Auth y CRM excluidos del CORS wildcard global;
- Inbox sin mocks, stores ni storage como autoridad;
- bundle sin secretos ni variables privadas de servidor.

La suite adversarial importa una instantánea en memoria. Las fixtures negativas
alteran cada invariante y deben fallar; las positivas demuestran que la guardia
tolera cambios documentales, el hotfix accesible del drawer, cambios ajenos,
checkout shallow y ejecución directa sobre main.

## Simulación PR #51

La simulación incluye exactamente sus cuatro rutas:

- `docs/V17-CANONICAL-UI-ERP-01A-INVENTORY.md`
- `docs/V17-CANONICAL-UI-ERP-01A-MATRIX.csv`
- `docs/V17-CANONICAL-UI-ERP-01A-ROADMAP.md`
- `docs/V17-COMMERCIAL-VERTICAL-01A-SPEC.md`

Las cuatro pasan porque están fuera del conjunto protegido y no alteran ninguna
invariante. PR #51 no fue modificado ni se reejecutó su workflow fallido.
