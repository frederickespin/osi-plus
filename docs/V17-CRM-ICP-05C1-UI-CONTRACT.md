# V17-CRM-ICP-05C1 — UI del ICP v2

## Alcance

Este lote se apila sobre la API `V17-CRM-ICP-05B1` y añade el primer consumidor visual del ICP v2 dentro del Inbox Comercial. No modifica el esquema, no aplica migraciones, no activa Production y conserva `productionApiEnabled=false`.

La experiencia toma como referencia visual el último ERP anterior a la integración CRM: `https://osi-plus-v17-experience-preview-02a-cxp80thtn.vercel.app/sales/pipeline`.

## Estado del consumidor funcional

El consumidor funcional construido inicialmente permanece congelado como referencia técnica y no cuenta con aprobación visual. No debe activarse ni considerarse el diseño final. Su flujo actual de tres pasos conserva:

1. búsqueda tenant-first de un Client existente o captura atómica de Client inline;
2. modalidad, tipo de servicio, canal y necesidad/método de Survey;
3. origen, destino confirmado/aproximado/pendiente y hasta ocho paradas adicionales.

El destino pendiente sólo se presenta para `LOCAL` y cuando la sesión publica el permiso explícito `pipeline:create:pending-destination`. El servidor vuelve a validar la autoridad.

## Preview visual para aprobación

`/experience-preview/icp` no reutiliza el consumidor funcional. Presenta una experiencia sintética, autónoma y sin API para revisar el diseño antes de generar el formulario definitivo:

1. ICP mínimo, Paso 1: Client, contacto del caso, tipo de cliente, teléfono/WhatsApp, correo y canal.
2. ICP mínimo, Paso 2: origen, destino y notas del requerimiento.
3. Después de crear el caso, la Ficha muestra **Servicios** y **Survey** como pestañas independientes junto a las demás áreas.
4. **Servicios** contiene servicio principal, alcance y servicios complementarios.
5. **Survey** permite plantear coordinación presencial, virtual, Mini Survey o información enviada por el cliente mediante listado, fotos y/o videos.

El Preview omite por completo RNC/cédula, volumen/CBM, paradas y coordinación de Survey dentro del ICP.

## Volumen

El formulario no contiene entrada de volumen ni CBM y el JSON enviado no incluye `estimatedCbm`. El consumidor funcional congelado todavía comunica **Volumen pendiente**, pero el Preview aprobado para revisión no dedica campos, avisos ni espacio visual al volumen. El `estimatedCbm: null` usado al calcular el hash pertenece al contrato normalizado del servidor y no se transmite como dato capturado.

## Seguridad y runtime

- `VITE_CRM_ICP_V2_UI_MODE` falla cerrado y admite sólo `DISABLED`, `LOCAL_ONLY` o `PREVIEW_REHEARSAL`.
- Local exige loopback real y ausencia de señales Vercel.
- Preview exige rama `feature/v17-crm-icp-ui-05c1` y batch `V17-CRM-ICP-05C1-PREVIEW`.
- El navegador usa rutas same-origin, token de sesión en memoria, `credentials: same-origin`, respuestas privadas y no almacena consultas, direcciones, casos ni comandos.
- Production, `main` y cualquier configuración parcial permanecen deshabilitados.
- El perfil remoto UI reutiliza el Preview CRM autenticado y habilita el API ICP sólo para la pareja exacta rama/batch; las mutaciones CRM históricas y la mutación comercial permanecen desactivadas.
- `/experience-preview/icp` es una demostración visual sin autenticación disponible únicamente cuando las constantes inmutables de build certifican Vercel Preview y la rama UI exacta. Usa datos sintéticos en memoria y no realiza llamadas al API.

## Fuera de alcance

No incluye edición de casos o rutas, revisiones 2+, captura de inventario, cálculo de volumen, cotización, activación productiva, despliegue de migración 22 en Production ni backfill desde direcciones legacy.
