WITH
target_schemas AS (
  SELECT oid, nspname
  FROM pg_namespace
  WHERE nspname IN ('osi', 'public')
),
tables AS (
  SELECT jsonb_agg(
    jsonb_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind)
    ORDER BY n.nspname, c.relname
  ) AS value
  FROM pg_class c
  JOIN target_schemas n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND c.relname <> '_prisma_migrations'
),
columns AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'position', a.attnum,
      'name', a.attname,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'nullable', NOT a.attnotnull,
      'default', pg_get_expr(d.adbin, d.adrelid),
      'identity', a.attidentity,
      'generated', a.attgenerated,
      'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE co.collname END
    )
    ORDER BY n.nspname, c.relname, a.attnum
  ) AS value
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN target_schemas n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  LEFT JOIN pg_collation co ON co.oid = a.attcollation
  WHERE c.relkind IN ('r', 'p')
    AND c.relname <> '_prisma_migrations'
    AND a.attnum > 0
    AND NOT a.attisdropped
),
enums AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'name', t.typname,
      'labels', labels.value
    )
    ORDER BY n.nspname, t.typname
  ) AS value
  FROM pg_type t
  JOIN target_schemas n ON n.oid = t.typnamespace
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS value
    FROM pg_enum e
    WHERE e.enumtypid = t.oid
  ) labels
  WHERE t.typtype = 'e'
),
indexes AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', i.relname,
      'definition', pg_get_indexdef(i.oid)
    )
    ORDER BY n.nspname, c.relname, i.relname
  ) AS value
  FROM pg_index x
  JOIN pg_class c ON c.oid = x.indrelid
  JOIN target_schemas n ON n.oid = c.relnamespace
  JOIN pg_class i ON i.oid = x.indexrelid
  WHERE c.relname <> '_prisma_migrations'
),
constraints AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    )
    ORDER BY n.nspname, c.relname, con.conname
  ) AS value
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN target_schemas n ON n.oid = c.relnamespace
  WHERE c.relname <> '_prisma_migrations'
),
functions AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'identity_args', pg_get_function_identity_arguments(p.oid),
      'definition', pg_get_functiondef(p.oid)
    )
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  ) AS value
  FROM pg_proc p
  JOIN target_schemas n ON n.oid = p.pronamespace
),
triggers AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', tg.tgname,
      'definition', pg_get_triggerdef(tg.oid, true)
    )
    ORDER BY n.nspname, c.relname, tg.tgname
  ) AS value
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN target_schemas n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
)
SELECT jsonb_build_object(
  'schemas', (SELECT jsonb_agg(nspname ORDER BY nspname) FROM target_schemas),
  'tables', COALESCE(tables.value, '[]'::jsonb),
  'columns', COALESCE(columns.value, '[]'::jsonb),
  'enums', COALESCE(enums.value, '[]'::jsonb),
  'indexes', COALESCE(indexes.value, '[]'::jsonb),
  'constraints', COALESCE(constraints.value, '[]'::jsonb),
  'functions', COALESCE(functions.value, '[]'::jsonb),
  'triggers', COALESCE(triggers.value, '[]'::jsonb)
)
FROM tables, columns, enums, indexes, constraints, functions, triggers;
