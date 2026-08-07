# MT-01C1B2A — Estado global y parsing seguro

## Alcance runtime

`requireAuth` sólo es consumido por `authContextPilot`, que protege las rutas
JWT de Usuarios, Clientes y Proyectos. Cada solicitud LEGACY consulta una vez
`User.status`; el resultado se conserva únicamente en la propia solicitud.
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

## Contrato de cuerpos JSON

- JSON malformado: `400 REQUEST_JSON_INVALID`.
- Body obligatorio vacío: `400 REQUEST_JSON_REQUIRED`.
- Valor JSON que no sea objeto: `400 REQUEST_JSON_OBJECT_REQUIRED`.
- Content-Type explícito incompatible: `415 REQUEST_CONTENT_TYPE_INVALID`.
- Tamaño superior al límite: `413 REQUEST_BODY_TOO_LARGE`.

Los errores no incluyen el body, contraseñas, tokens ni el stack del parser.
Los objetos ya parseados por la plataforma se admiten por compatibilidad; los
cuerpos raw requieren un Content-Type JSON válido.

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
