# V17-CRM-ICP-05C1 — UI del ICP v2

## Alcance

Este lote se apila sobre la API `V17-CRM-ICP-05B1` y añade el primer consumidor visual del ICP v2 dentro del Inbox Comercial. No modifica el esquema, no aplica migraciones, no activa Production y conserva `productionApiEnabled=false`.

La experiencia toma como referencia visual el último ERP anterior a la integración CRM: `https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/sales/pipeline`.

## Consumidor funcional aprobado

El consumidor funcional adopta el diseño visual aprobado y reemplaza el formulario anterior. Usa dos pasos:

1. Client existente o inline, contacto del caso, tipo de cliente, teléfono/WhatsApp, correo y canal;
2. país, origen, destino confirmado/aproximado/pendiente y notas del requerimiento.

La modalidad se deriva de los países: RD→RD es Local/Nacional, RD→exterior es Exportación y exterior→RD es Importación. El ICP tiene cero paradas. El destino pendiente sólo se presenta cuando la sesión posee el permiso explícito `pipeline:create:pending-destination`; el servidor vuelve a validar la autoridad.

Servicio y decisión de Survey se registran internamente como pendientes de definición. No se muestran ni se deciden dentro del ICP. Las notas se conservan en el bloque namespaced `milestonesJson.icpV2`, separado de facturación, operación y notas posteriores.

## Referencia visual aprobada

El diseño actual del ICP fue aprobado funcional y visualmente. `/experience-preview/icp` conserva una experiencia sintética, autónoma y sin API para comprobar que el consumidor consolidado no degrade esa autoridad:

1. ICP mínimo, Paso 1: Client, contacto del caso, tipo de cliente, teléfono/WhatsApp, correo y canal.
2. ICP mínimo, Paso 2: origen, destino y notas del requerimiento.
3. Después de crear el caso, la Ficha muestra **Servicios** y **Survey** como pestañas independientes junto a las demás áreas.
4. **Servicios** contiene servicio principal, alcance y servicios complementarios.
5. **Survey** permite plantear coordinación presencial, virtual, Mini Survey o información enviada por el cliente mediante listado, fotos y/o videos.

El Preview omite por completo RNC/cédula, volumen/CBM, paradas y coordinación de Survey dentro del ICP.

## Volumen

El formulario no contiene entrada de volumen ni CBM y el JSON enviado no incluye `estimatedCbm`. Tampoco dedica campos, avisos ni espacio visual al volumen. El `estimatedCbm: null` usado al calcular el hash pertenece al contrato normalizado del servidor y no se transmite como dato capturado.

## Seguridad y runtime

- `VITE_CRM_ICP_V2_UI_MODE` falla cerrado y admite sólo `DISABLED`, `LOCAL_ONLY` o `PREVIEW_REHEARSAL`.
- Local exige loopback real y ausencia de señales Vercel.
- Preview consolidado exige rama `feature/v17-auth-users-tenant-first` y batch `V17-ICP-CONSOLIDATION-02A-PREVIEW`.
- El navegador usa rutas same-origin, el token de la sesión autenticada, `credentials: same-origin`, respuestas privadas y no almacena consultas, direcciones, casos ni comandos.
- Sólo A y V pueden entrar al CRM; crear exige el grant explícito `pipeline:create`, los denies prevalecen y un 401 limpia la sesión mediante el límite canónico de autenticación.
- Production, `main` y cualquier configuración parcial permanecen deshabilitados.
- El perfil remoto UI reutiliza el Preview CRM autenticado y habilita el API ICP sólo para la pareja exacta rama/batch; las mutaciones CRM históricas y la mutación comercial permanecen desactivadas.
- `/experience-preview/icp` es una demostración visual sin autenticación disponible únicamente cuando las constantes inmutables de build certifican Vercel Preview y la rama UI exacta. Usa datos sintéticos en memoria y no realiza llamadas al API.

## Fuera de alcance

No incluye edición de casos o rutas, revisiones 2+, captura de inventario, cálculo de volumen, Servicios, Survey, cotización, activación productiva, despliegue de migración 22 en Production ni backfill desde direcciones legacy. La Production heredada no tiene usuarios activos y se considera obsoleta; aun así, será reemplazada sólo mediante un corte controlado posterior.
