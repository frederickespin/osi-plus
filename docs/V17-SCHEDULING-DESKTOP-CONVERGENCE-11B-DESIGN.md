# V17 Scheduling Desktop Convergence 11B — decisión de modelo

## Autoridades conservadas

- `SurveyAssignment` continúa siendo la única autoridad de una cita y de la entrada a Survey App.
- `SurveyDraft` y `SurveyPublication` continúan siendo la única autoridad del levantamiento y de su resultado publicado.
- `PipelineCaseRouteSnapshot` continúa siendo la dirección histórica de la ruta. Scheduling sólo fija la versión usada.
- `LogisticsPlanRevision` continúa siendo la autoridad del cálculo operacional de zona, distancia, tiempo y recursos.
- Costing, no Scheduling, será la única autoridad de importes. Un Visit Fee puede referenciar una revisión logística y, cuando exista, una fuente económica publicada; nunca calcula dinero localmente.

## Brecha demostrada en Survey 04A

El modelo 04A sólo representa una asignación ya programada: evaluador, inicio, fin y estado operativo. No puede representar sin ambigüedad:

- una decisión `NOT_REQUIRED`, virtual o pendiente de información que todavía no tiene cita;
- una política administrable de slots, capacidad, sábados, cierres y zona gratuita;
- el historial append-only de método, reprogramación, cancelación o cambio de evaluador;
- las fases independientes de cálculo, comunicación, autorización y pago de Visit Fee;
- una comunicación PIC preparada sin transporte externo.

Guardar esos hechos en `contextSnapshot`, en un store o en `localStorage` convertiría un snapshot en autoridad mutable y no permitiría concurrencia ni auditoría relacional. Por eso 11B requiere una migración aditiva mínima.

## Extensión aditiva propuesta

1. `SurveyEvaluationDecision`: decisión comercial por caso, método explícito y estado separado del estado interno de Survey.
2. `SurveySchedulePolicyVersion`: política versionada tenant-first. Su JSON cerrado contiene perfiles, slots, cierres, sábado, zona gratuita y capacidades operacionales por referencia pública de Membership.
3. Extensión nullable de `SurveyAssignment`: decisión, política, perfil, zona, slot y origen logístico usados. Las filas 04A existentes siguen siendo válidas.
4. `SurveyAssignmentEvent`: historia append-only de agenda, reprogramación, cancelación, cambio de evaluador e invalidación por ruta.
5. `SurveyVisitFee`: estados independientes de necesidad, comunicación, autorización y pago; referencia la revisión del Motor y no contiene fórmula.
6. `SurveyCommunicationRecord`: PIC preparado/registrado, con template/version, audiencia y canal; no ejecuta transporte.

No se crea una tabla paralela de visitas ni un segundo Survey.

## Capacidades operacionales

11B no crea un dominio general de empleados. Introduce una interfaz cerrada de capacidades dentro de la política versionada de Scheduling. El servidor cruza `membershipRef` con User, Membership y Tenant activos; RBAC autoriza la API, mientras la política decide si esa persona puede realizar el método y zona concretos. Una política ausente falla cerrada.

La convergencia futura con Recursos Humanos debe sustituir ese proveedor por una autoridad general de capacidades sin cambiar los contratos públicos de Scheduling.

## Equivalencia histórica congelada

La plantilla inicial recupera, como datos versionados y no como constantes del componente:

- `METRO`: mañana 09:00–12:00 y tarde 14:00–16:30; capacidad diaria 2.
- `INTERIOR_SHORT`: mañana/tarde; capacidad diaria 2; hasta 30 km según la fuente histórica.
- `INTERIOR_LONG`: mañana/tarde; capacidad diaria 1; más de 30 km según la fuente histórica.
- domingo cerrado;
- sábado requiere validación administrativa explícita.

La clasificación real de zona/distancia y la gratuidad deben proceder del Motor 07A y de reglas activas. Los valores históricos sólo sirven para una política inicial explícitamente versionada; no se codifican en React.

## Límites

- Production continúa apagado y no recibe la migración.
- No se porta `visitCalendarStore`, `schedulingBridge`, `salesStore` ni fórmulas monetarias históricas.
- No se implementan envío externo, Relaciones Comerciales, Operaciones ni Auth V2.
