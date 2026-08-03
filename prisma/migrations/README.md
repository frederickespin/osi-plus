# Cadena canónica DB-01K

Esta es la única cadena activa que Prisma puede ejecutar. Su orden definitivo es:

1. `20260801000000_production_baseline`
2. `20260801001000_mt01a_tenant_memberships`
3. `20260801002000_commercial_audit_log`
4. `20260801003000_approval_requests`
5. `20260801004000_risk_engine_rules_evaluations`
6. `20260801005000_logistic_override_approvals`
7. `20260801006000_quote_change_orders`
8. `20260801007000_logistics_geography_zone_rules`
9. `20260801008000_vehicle_engine_settings`
10. `20260801009000_logistics_rate_metadata`
11. `20260801010000_crate_settings`

Todas las conexiones Prisma deben declarar `schema=osi`. La adopción de esta cadena en una base existente requiere el procedimiento formal documentado en DB-01K; no debe ejecutarse `migrate resolve`, `migrate deploy`, `db push` ni `migrate reset` contra producción sin una autorización separada.

Las migraciones anteriores se conservan, fuera de la ruta activa, en `prisma/migration-archive/pre-db01`.
