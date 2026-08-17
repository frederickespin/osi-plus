# V17-HUB-01A — Fundación canónica inactiva

El Hub es un catálogo de navegación, no una autoridad de autorización. La decisión se deriva del rol revalidado por el servidor y, cuando el contexto lo ofrece, de permisos efectivos. `deniedPermissions` prevalece siempre. Query strings, storage y headers `x-osi-*` no participan en la decisión.

La compuerta `VITE_OSI_HUB_MODE` acepta exclusivamente `DISABLED` y `LOCAL_ONLY`. La ausencia equivale a `DISABLED`; `LOCAL_ONLY` sólo funciona en loopback. El Hub y OSi Survey son chunks lazy y no se solicitan en modo desactivado.

Las ocho aplicaciones registradas permanecen inactivas. Comercial/CRM será el primer módulo conectado en un lote independiente. OSi Survey conserva únicamente descriptor, ruta y pantalla sin backend, asignaciones, drafts, autosave o persistencia.

Portal Cliente IP queda fuera del catálogo de empleados. Requerirá frontend y URL externos, identidad y sesiones propias, `AccessGrant` y scopes de servidor; nunca reutilizará una sesión de empleado.

