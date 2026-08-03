# DB-01D — Política de auditoría comercial

## Autoridad y aislamiento

- `tenantId` procede exclusivamente del contexto autenticado construido por el servidor; nunca se toma del body, query o evento.
- El rol se copia desde `TenantMembership` en el momento de la acción. No se acepta `roleSnapshot` enviado por el cliente.
- La FK compuesta `(tenant_id, actor_membership_id, actor_user_id)` impide asociar una membresía o usuario de otra empresa.
- Un actor del sistema utiliza `actorKind=SYSTEM`, sin usuario ni membresía, y conserva `roleSnapshot=SYSTEM`.
- La consulta exige `commercial:audit:view`, usa siempre el tenant del contexto y paginación por cursor con máximo de 100 filas.

## Matriz de criticidad

La acción y la entidad se mantienen como texto para permitir evolución. La criticidad se determina en el servicio; el llamador puede elevar un evento operativo a crítico, pero nunca degradar una acción crítica.

| Nivel | Acciones |
|---|---|
| Crítica | Aprobaciones y rechazos; descuentos excepcionales u overrides; adendas; change orders; cambios contractuales; reasignaciones; cambios de permisos o autorización. |
| Operativa | Consultas, visualizaciones, exportaciones informativas, sincronizaciones, comunicaciones no contractuales, cálculos preliminares y otros eventos que no cambian derechos, obligaciones o autoridad. |

### Fallo crítico

`executeCriticalAuditedMutation` ejecuta la mutación empresarial y la auditoría dentro de una misma transacción serializable. Si la auditoría no puede validarse o persistirse, la transacción completa revierte. No se suprimen `P2021`, FK, timeout ni otros errores.

### Fallo operativo

`appendOperationalAuditWithRetry` permite entre uno y cinco intentos controlados. Al agotar los intentos lanza un error explícito; nunca devuelve éxito falso ni descarta el error silenciosamente. Una cola durable queda fuera de DB-01D.

## Datos sensibles

El servicio redacta recursivamente claves de contraseña, token, autorización, cookies, secretos, API keys, credenciales, claves privadas y firmas. También limita profundidad, longitud de cadenas, cantidad de elementos y tamaño serializado. No se importa automáticamente el historial de `localStorage` ni el JSON heredado.

## Compatibilidad

- DB-01D no modifica `prisma/schema.prisma` ni rutas activas.
- `/api/commercial-audit-logs` permanece como adaptador heredado hasta que la tabla se despliegue y MT-01B proporcione tenant activo en el contexto autenticado.
- Las escrituras actuales de casos continúan sin cambios. La escritura dual se conectará por adaptador después del despliegue; no se activan llamadas nuevas en producción.
- KPI, SLA, propietarios y estados comerciales no cambian.

## Endpoints/adaptadores que requerirán conexión posterior

1. `api/commercial-audit-logs/index.js`: consulta paginada y filtrada con `commercial:audit:view`.
2. `api/cases/_service.js`: reemplazar escrituras opcionales críticas por `executeCriticalAuditedMutation` cuando DB-01D esté desplegado.
3. `api/approval/confirm.js`, `reject.js`, `negotiate.js`: auditoría crítica de decisiones.
4. `api/quote-addendums/index.js`: auditoría crítica de adendas.
5. Futuros endpoints de permisos y reasignación: auditoría crítica obligatoria.

Ninguno de estos adaptadores se conecta en DB-01D local para evitar consultas contra una tabla todavía ausente en producción.
