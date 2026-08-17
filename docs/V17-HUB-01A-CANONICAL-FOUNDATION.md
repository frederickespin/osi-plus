# V17-HUB-01A — Fundación canónica inactiva

El Hub es un catálogo de navegación, no una autoridad de autorización. La decisión se deriva del rol revalidado por el servidor y, cuando el contexto lo ofrece, de permisos efectivos. `deniedPermissions` prevalece siempre. Usuario, rol y cualquier permiso efectivo llegan únicamente de la sesión revalidada; el Hub no consume tenant o membership enviados por el navegador. Query strings, hash, URL, `localStorage`, `sessionStorage`, headers `x-osi-*` y headers de proxy no participan en la decisión.

**Acceso a una aplicación** significa únicamente que el contexto autenticado puede ver y abrir su descriptor/ruta en el Hub. Los roles baseline describen ese acceso inicial y no conceden ninguno de los permisos internos anotados en el catálogo. **Permisos dentro de la aplicación** deben volver a resolverse y exigirse en cada endpoint o comando del módulo conectado; entrar desde una tarjeta o ruta directa nunca los crea. OSi Survey no tiene roles baseline: sólo un permiso efectivo explícito permite abrir su descriptor inactivo.

La compuerta `VITE_OSI_HUB_MODE` acepta exclusivamente `DISABLED` y `LOCAL_ONLY`. La ausencia equivale a `DISABLED`; `LOCAL_ONLY` sólo funciona con los hostnames literales `localhost`, `127.0.0.1` y `[::1]`, y rechaza la presencia de cualquier variable `VERCEL*`. No usa headers de proxy para decidir el host. El Hub y OSi Survey son chunks lazy y no se solicitan, prefetchean ni montan en modo desactivado.

Las ocho aplicaciones registradas permanecen inactivas. Comercial/CRM será el primer módulo conectado en un lote independiente. OSi Survey conserva únicamente descriptor, ruta y pantalla sin backend, asignaciones, drafts, autosave o persistencia.

Portal Cliente IP queda fuera del catálogo de empleados. Requerirá frontend y URL externos, identidad y sesiones propias, `AccessGrant` y scopes de servidor; nunca reutilizará una sesión de empleado.
