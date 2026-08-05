# MT-01B2A — Coordinación frontend de sesión V2

## Estado y alcance

Esta fundación está desacoplada del arranque de la aplicación y desactivada por defecto:

```env
MT01B_AUTH_MODE=LEGACY
MT01B_TENANT_SWITCH_ENABLED=false
VITE_MT01B2_CLIENT_ENABLED=false
```

No modifica el login heredado, `/auth/me`, la interfaz, el tenant activo ni las rutas comerciales. No crea migraciones ni consulta tablas Auth mientras el flag del cliente permanezca apagado.

## Diseño del coordinador

`SessionCoordinator` conserva el access token solamente en memoria. El refresh token permanece exclusivamente en la cookie HttpOnly administrada por el backend. Transporte, reloj, actividad, canal y mecanismo de bloqueo son interfaces inyectables para que la coordinación pueda probarse sin navegador ni servidor reales.

La máquina de estados admite únicamente transiciones declaradas:

```text
DISABLED
LEGACY ↔ INITIALIZING
INITIALIZING → REFRESHING
REFRESHING → AUTHENTICATED | RECOVERABLE_WAIT | OFFLINE | REAUTH_REQUIRED | LEGACY
RECOVERABLE_WAIT → REFRESHING | AUTHENTICATED | OFFLINE | REAUTH_REQUIRED
AUTHENTICATED → REFRESHING | OFFLINE | REAUTH_REQUIRED | LOGGED_OUT
OFFLINE → REFRESHING | AUTHENTICATED | REAUTH_REQUIRED | LOGGED_OUT
REAUTH_REQUIRED → INITIALIZING | LOGGED_OUT | LEGACY
LOGGED_OUT → INITIALIZING | LEGACY
```

`AbortController` invalida una respuesta de refresh si ocurre logout, revocación, mensaje terminal de otra pestaña o destrucción del coordinador. Un contador de generación evita instalar un token recibido después de esa invalidación.

## Protocolo entre pestañas

Web Locks es el single-flight principal. La pestaña que obtiene `osi-plus:mt01b2:refresh` llama al servidor; las demás esperan el resultado comunicado por `BroadcastChannel` sin hacer una llamada adicional.

Mensajes versión 1:

* `REFRESH_STARTED`: identifica una operación mediante nonce y fecha.
* `AUTHENTICATED`: incluye access token corto, expiración, versión de autorización, nonce propio y nonce de operación.
* `LOGOUT`: elimina inmediatamente todas las copias en memoria.
* `REAUTH_REQUIRED`: elimina las copias y obliga a iniciar sesión.

Se rechazan mensajes con versión desconocida, nonce inválido, fecha obsoleta o futura, operación no reconocida, JWT mal formado, expiración inconsistente o `authorizationVersion` inconsistente. El refresh token nunca circula por el canal.

BroadcastChannel no constituye una frontera frente a XSS: un script malicioso ejecutándose en el mismo origen ya podría acceder al access token en memoria. Por eso `/auth/me` y el backend continúan siendo la autoridad de identidad, tenant, rol y permisos.

## Fallback sin Web Locks

Cada pestaña conserva single-flight local, pero puede haber competencia ocasional entre pestañas. El backend converge mediante:

* `MT01B_REFRESH_IN_PROGRESS`: espera acotada con jitter y resultado del ganador.
* `MT01B_REFRESH_ALREADY_ROTATED`: espera al ganador; sin resultado confirmado exige reautenticación.
* `MT01B_AUTH_LOCK_TIMEOUT` y `MT01B_AUTH_STATEMENT_TIMEOUT`: reintento acotado.
* `MT01B_AUTH_DATABASE_UNAVAILABLE`: estado `OFFLINE`; reintento al recuperar conectividad.

La política predeterminada permite como máximo tres reintentos y limita cada espera. No existe temporizador recursivo ni ciclo de reintento infinito.

## Errores terminales

Sesión revocada, comprometida o inválida, membresía inactiva y cambio de `authorizationVersion` limpian memoria y pasan a `REAUTH_REQUIRED`. `MT01B_AUTH_V2_DISABLED` vuelve a `LEGACY` sin alterar la experiencia heredada. Todos los errores se reducen a código, recuperabilidad y espera; no se propagan SQL, URL, secretos ni payloads arbitrarios.

## Política de usuario activo

La fundación sólo considera mantenimiento preventivo cuando coinciden:

* conectividad disponible;
* pestaña visible;
* actividad reciente;
* access token próximo a vencer.

Los umbrales están en una política validada e inyectable. MT-01B2A no programa renovaciones periódicas ni codifica tiempos comerciales definitivos. Las pestañas ocultas o inactivas no refrescan continuamente.

## Activación futura

MT-01B2B deberá integrar el coordinador con el frontend, probar latencia desde una región equivalente a Vercel–Neon y confirmar el contrato V2. Antes de activar el flag deberán mantenerse el single-flight entre pestañas y las métricas separadas de red, lock, SQL, auditoría y commit.

Las guardias CI actuales fallan si:

* el flag Vite queda activo;
* un archivo del coordinador usa almacenamiento persistente;
* código de `src` fuera de `src/auth-v2` importa la fundación;
* se habilita HYBRID, tenant switch, SHADOW, ENFORCED o escritura dual.
