# MT-01B1 — Evidencia determinista de concurrencia refresh

## Contrato

Solicitudes concurrentes que presentan el mismo refresh token producen exactamente una respuesta ganadora `200` y `N-1` respuestas perdedoras `409`.

Sólo la ganadora puede emitir access token, refresh token o `Set-Cookie` de autenticación. Una perdedora tampoco puede emitir una cookie de borrado: una respuesta tardía nunca debe borrar ni reemplazar la cookie ganadora.

La base conserva exactamente:

- un sucesor `ACTIVE`;
- un predecesor `ROTATED`;
- un enlace de reemplazo;
- una auditoría de rotación.

## Inicio concurrente

El arnés usa una barrera explícita en memoria. Cada operación alcanza la barrera antes de que cualquiera invoque la rotación. No usa sleeps, retries ni ampliaciones de timeout.

Cada response posee request ID, índice y captura propios. El orden de inicio y resolución se registra por separado para no atribuir la respuesta ganadora a una promesa perdedora.

## Evidencia de fallo

`MT01B_REFRESH_RACE_ARTIFACT_PATH` habilita exclusivamente la escritura de evidencia cuando el test falla. El JSON contiene:

- status y resultado funcional;
- cookie clasificada como `NONE`, `AUTH` o `CLEAR`, nunca su valor;
- presencia o ausencia de tokens en body y headers;
- orden y duración de cada request;
- código de error sanitizado;
- conteos de tokens, sucesores, enlaces, auditorías y locks pendientes;
- cada invariante y su resultado.

No contiene Authorization, cookies, tokens, emails, UUID completos, credenciales, bodies empresariales ni connection strings. GitHub Actions publica el archivo sólo cuando falla el paso canónico; una ejecución verde no crea artefactos.

## Fallos distinguibles

Las negativas verifican códigos independientes para:

- status perdedor distinto de 409;
- cookie `AUTH` en perdedor;
- cookie `CLEAR` en perdedor;
- token en body;
- token en headers;
- dos ganadores;
- dos sucesores;
- auditoría duplicada;
- captura compartida entre requests.
