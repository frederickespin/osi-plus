# MT-01C1B2A — Estado global y parsing seguro

## Alcance runtime

`requireAuth` sólo es consumido directamente por `authContextPilot`, que afecta
indirectamente los seis métodos GET/POST de Usuarios, Clientes y Proyectos.
Cada solicitud LEGACY consulta una vez `User.status`; la promesa se guarda en
un `Symbol` del objeto `req` y nunca se comparte entre solicitudes o usuarios.
Las 25 rutas que confían en encabezados heredados permanecen congeladas.

| Endpoint | Método | Parser estricto | Estado global vigente |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | Sí, máximo 16 KiB | Sí |
| `/api/auth/me` | GET | No tiene body | Sí |
| `/api/users` | GET/POST | POST | Sí, mediante `requireAuth` |
| `/api/clients` | GET/POST | POST | Sí, mediante `requireAuth` |
| `/api/projects` | GET/POST | POST | Sí, mediante `requireAuth` |
| `/api/auth/refresh` | POST | No acepta body | V2 sigue desactivado |
| `/api/auth/logout` | POST | No acepta body | V2 sigue desactivado |
| `/api/auth/session/upgrade` | POST | No acepta body | V2 sigue desactivado |

| Consumidor indirecto | Método | Permiso LEGACY existente | Consulta de estado |
| --- | --- | --- | --- |
| `/api/users` | GET | `users:view` | Una por solicitud |
| `/api/users` | POST | `users:create` | Una por solicitud |
| `/api/clients` | GET | `clients:view` | Una por solicitud |
| `/api/clients` | POST | `clients:create` | Una por solicitud |
| `/api/projects` | GET | `projects:view` | Una por solicitud |
| `/api/projects` | POST | `projects:create` | Una por solicitud |

Para los seis métodos indirectos, un actor `active` conserva permisos y
contratos; `inactive`, `suspended`, desconocido o eliminado recibe 401. Una
falla al consultar el estado devuelve `503 AUTH_DATABASE_UNAVAILABLE` sin
detalles. La autenticación no intercepta un 404 empresarial emitido después de
autorizar la solicitud. Ni `status` ni `role` del JWT deciden el estado global.

## Contrato de cuerpos JSON

- JSON malformado: `400 REQUEST_JSON_INVALID`.
- Body obligatorio vacío: `400 REQUEST_JSON_REQUIRED`.
- Valor JSON que no sea objeto: `400 REQUEST_JSON_OBJECT_REQUIRED`.
- Content-Type explícito incompatible: `415 REQUEST_CONTENT_TYPE_INVALID`.
- Tamaño superior al límite: `413 REQUEST_BODY_TOO_LARGE`.
- Content-Length inválido: `400 REQUEST_CONTENT_LENGTH_INVALID`.
- UTF-8 inválido: `400 REQUEST_JSON_INVALID`.
- Profundidad superior a 64: `400 REQUEST_JSON_TOO_DEEP`.
- Claves `__proto__`, `constructor` o `prototype`: `400 REQUEST_JSON_UNSAFE_KEYS`.

Los errores no incluyen el body, contraseñas, tokens ni el stack del parser.
Los objetos ya parseados por la plataforma se admiten por compatibilidad; los
cuerpos raw requieren un Content-Type JSON válido. `Content-Length` se valida
antes de leer y los streams chunked se interrumpen al superar el límite real en
bytes; el tamaño no se calcula por cantidad de caracteres.

## Inventario del parser heredado no migrado

El wrapper común convertía cualquier `SyntaxError` no tipado en 500, mientras
`readJsonBody` ocultaba JSON raw inválido devolviendo `{}`. Este bloque migra
solamente los endpoints indicados arriba. Permanecen con el parser heredado,
para una fase posterior: OSI (`index`, detalle, handshake y devolución),
señales/validaciones K, PGD, sugerencias PTF y las acciones de plantillas
(`draft`, `submit`, `reject`, `publish`, `approve` y `approve-batch`). No se
modifican ni se incluyen dentro de las 25 excepciones de autenticación.

## Estado y revocación LEGACY

Sólo `active`, después de `trim().toLowerCase()`, habilita autenticación. Login
y `/auth/me` revalidan el estado persistido. `requireAuth` añade una consulta
selectiva de estado por solicitud y reutiliza su promesa si el adaptador se
invoca más de una vez en esa misma solicitud.

Un JWT LEGACY aún vigente puede volver a ser aceptado si el administrador
reactiva al usuario. La revocación definitiva de una familia corresponde a
V2/AuthSession y permanece fuera de este bloque.

El login siempre ejecuta una comparación bcrypt: para una identidad inexistente
usa un hash ficticio fijo y no sensible; para una identidad existente compara
la contraseña antes de evaluar su estado. Esto elimina la bifurcación evidente
que omitía bcrypt, pero no se presenta como garantía de tiempo constante.

Existe una carrera residual: una suspensión posterior a que `requireAuth`
resuelva no cancela una escritura ya iniciada. Las operaciones críticas deberán
revalidar autorización dentro de su transacción en una fase posterior.
