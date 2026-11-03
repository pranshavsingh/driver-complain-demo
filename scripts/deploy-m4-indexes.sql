\set ON_ERROR_STOP on

-- PREFLIGHT: Target Database Assertion
DO $$
BEGIN
  IF current_database() IN ('postgres', 'template1') THEN
    RAISE EXCEPTION 'OPERATOR SCRIPT ABORT: Must be executed against application database, not maintenance database "%"', current_database();
  END IF;
END $$;

-- STEP 0: Wrong-Table Collision Preflight Guard
-- Aborts immediately if an expected index name exists on a different table. NEVER drops it automatically.
DO $$
DECLARE
  v_collision record;
BEGIN
  SELECT 
    c.relname AS idx_name, 
    t.relname AS actual_tbl, 
    e.tbl_name AS expected_tbl
  INTO v_collision
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN (
    SELECT 'Complaint'::text AS tbl_name, 'Complaint_vehicleId_idx'::text AS idx_name
    UNION ALL SELECT 'LoadingRecord', 'LoadingRecord_driverId_status_createdAt_idx'
    UNION ALL SELECT 'Vehicle', 'Vehicle_createdAt_id_idx'
    UNION ALL SELECT 'User', 'User_createdByAdminId_idx'
    UNION ALL SELECT 'User', 'User_createdAt_id_idx'
  ) e ON e.idx_name = c.relname
  WHERE n.nspname = 'public'
    AND t.relname <> e.tbl_name
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'COLLISION SAFETY ABORT: Index "%" already exists on wrong table "%" (expected on table "%"). Cannot automatically drop an index belonging to another table. Human intervention required.',
      v_collision.idx_name, v_collision.actual_tbl, v_collision.expected_tbl;
  END IF;
END $$;

-- STEP 1: Concurrently drop invalid, not-ready, or wrongly-defined indexes on the intended table
WITH expected_indexes AS (
  SELECT 'Complaint'::text AS tbl_name, 'Complaint_vehicleId_idx'::text AS idx_name, 1 AS key_atts, '"vehicleId" ASC NULLS LAST'::text AS expected_cols
  UNION ALL SELECT 'LoadingRecord', 'LoadingRecord_driverId_status_createdAt_idx', 3, '"driverId" ASC NULLS LAST, "status" ASC NULLS LAST, "createdAt" ASC NULLS LAST'
  UNION ALL SELECT 'Vehicle', 'Vehicle_createdAt_id_idx', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
  UNION ALL SELECT 'User', 'User_createdByAdminId_idx', 1, '"createdByAdminId" ASC NULLS LAST'
  UNION ALL SELECT 'User', 'User_createdAt_id_idx', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
),
actual_indexes AS (
  SELECT
    n.nspname AS schema_name,
    t.relname AS tbl_name,
    t.relkind AS tbl_kind,
    c.relname AS idx_name,
    c.relkind AS idx_kind,
    am.amname AS access_method,
    i.indisunique,
    i.indisvalid,
    i.indisready,
    i.indnatts,
    i.indnkeyatts,
    (i.indexprs IS NOT NULL) AS has_expressions,
    (i.indpred IS NOT NULL) AS is_partial,
    string_agg(
      CASE 
        WHEN i.indkey[s.pos] = 0 THEN '<expression>'
        ELSE quote_ident(a.attname)
      END || ' ' ||
      CASE WHEN (i.indoption[s.pos] & 1) = 1 THEN 'DESC' ELSE 'ASC' END || ' ' ||
      CASE WHEN (i.indoption[s.pos] & 2) = 2 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END,
      ', ' ORDER BY s.pos
    ) AS actual_cols
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = c.relam
  CROSS JOIN LATERAL generate_series(0, i.indnkeyatts - 1) AS s(pos)
  LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[s.pos]
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT idx_name FROM expected_indexes)
  GROUP BY n.nspname, t.relname, t.relkind, c.relname, c.relkind, am.amname, i.indisunique, i.indisvalid, i.indisready, i.indnatts, i.indnkeyatts, i.indexprs, i.indpred
)
SELECT 'DROP INDEX CONCURRENTLY IF EXISTS "public"."' || a.idx_name || '";'
FROM actual_indexes a
JOIN expected_indexes e 
  ON e.tbl_name = a.tbl_name 
 AND e.idx_name = a.idx_name
WHERE NOT (
  a.schema_name = 'public'
  AND a.tbl_kind = 'r'
  AND a.idx_kind = 'i'
  AND a.access_method = 'btree'
  AND a.indisunique = false
  AND a.indisvalid = true
  AND a.indisready = true
  AND a.indnatts = e.key_atts
  AND a.indnkeyatts = e.key_atts
  AND a.has_expressions = false
  AND a.is_partial = false
  AND a.actual_cols = e.expected_cols
);
\gexec

-- STEP 2: Concurrently create missing indexes outside transactions
WITH expected_indexes AS (
  SELECT 'Complaint'::text AS tbl_name, 'Complaint_vehicleId_idx'::text AS idx_name, '("vehicleId")'::text AS create_cols, 1 AS key_atts, '"vehicleId" ASC NULLS LAST'::text AS expected_cols
  UNION ALL SELECT 'LoadingRecord', 'LoadingRecord_driverId_status_createdAt_idx', '("driverId", "status", "createdAt")', 3, '"driverId" ASC NULLS LAST, "status" ASC NULLS LAST, "createdAt" ASC NULLS LAST'
  UNION ALL SELECT 'Vehicle', 'Vehicle_createdAt_id_idx', '("createdAt", "id")', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
  UNION ALL SELECT 'User', 'User_createdByAdminId_idx', '("createdByAdminId")', 1, '"createdByAdminId" ASC NULLS LAST'
  UNION ALL SELECT 'User', 'User_createdAt_id_idx', '("createdAt", "id")', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
),
current_valid_indexes AS (
  SELECT
    t.relname AS tbl_name,
    c.relname AS idx_name,
    am.amname AS access_method,
    i.indisunique,
    i.indnatts,
    i.indnkeyatts,
    (i.indexprs IS NOT NULL) AS has_expressions,
    (i.indpred IS NOT NULL) AS is_partial,
    string_agg(
      quote_ident(a.attname) || ' ' ||
      CASE WHEN (i.indoption[s.pos] & 1) = 1 THEN 'DESC' ELSE 'ASC' END || ' ' ||
      CASE WHEN (i.indoption[s.pos] & 2) = 2 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END,
      ', ' ORDER BY s.pos
    ) AS actual_cols
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = c.relam
  CROSS JOIN LATERAL generate_series(0, i.indnkeyatts - 1) AS s(pos)
  LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[s.pos]
  WHERE n.nspname = 'public'
    AND c.relkind = 'i'
    AND t.relkind = 'r'
    AND i.indisvalid = true
    AND i.indisready = true
  GROUP BY t.relname, c.relname, am.amname, i.indisunique, i.indnatts, i.indnkeyatts, i.indexprs, i.indpred
)
SELECT 'CREATE INDEX CONCURRENTLY IF NOT EXISTS "' || e.idx_name || '" ON "public"."' || e.tbl_name || '" ' || e.create_cols || ';'
FROM expected_indexes e
LEFT JOIN current_valid_indexes c 
  ON c.tbl_name = e.tbl_name 
 AND c.idx_name = e.idx_name 
 AND c.access_method = 'btree'
 AND c.indisunique = false
 AND c.indnatts = e.key_atts
 AND c.indnkeyatts = e.key_atts
 AND c.has_expressions = false
 AND c.is_partial = false
 AND c.actual_cols = e.expected_cols
WHERE c.idx_name IS NULL;
\gexec

-- STEP 3: Strict post-deployment verification using the identical definition contract
DO $$
DECLARE
  v_record record;
  v_count int := 0;
BEGIN
  FOR v_record IN (
    WITH expected_indexes AS (
      SELECT 'Complaint'::text AS tbl_name, 'Complaint_vehicleId_idx'::text AS idx_name, 1 AS key_atts, '"vehicleId" ASC NULLS LAST'::text AS expected_cols
      UNION ALL SELECT 'LoadingRecord', 'LoadingRecord_driverId_status_createdAt_idx', 3, '"driverId" ASC NULLS LAST, "status" ASC NULLS LAST, "createdAt" ASC NULLS LAST'
      UNION ALL SELECT 'Vehicle', 'Vehicle_createdAt_id_idx', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
      UNION ALL SELECT 'User', 'User_createdByAdminId_idx', 1, '"createdByAdminId" ASC NULLS LAST'
      UNION ALL SELECT 'User', 'User_createdAt_id_idx', 2, '"createdAt" ASC NULLS LAST, "id" ASC NULLS LAST'
    ),
    actual_indexes AS (
      SELECT
        n.nspname AS schema_name,
        t.relname AS tbl_name,
        t.relkind AS tbl_kind,
        c.relname AS idx_name,
        c.relkind AS idx_kind,
        am.amname AS access_method,
        i.indisunique,
        i.indisvalid,
        i.indisready,
        i.indnatts,
        i.indnkeyatts,
        (i.indexprs IS NOT NULL) AS has_expressions,
        (i.indpred IS NOT NULL) AS is_partial,
        string_agg(
          quote_ident(a.attname) || ' ' ||
          CASE WHEN (i.indoption[s.pos] & 1) = 1 THEN 'DESC' ELSE 'ASC' END || ' ' ||
          CASE WHEN (i.indoption[s.pos] & 2) = 2 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END,
          ', ' ORDER BY s.pos
        ) AS actual_cols
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = c.relam
      CROSS JOIN LATERAL generate_series(0, i.indnkeyatts - 1) AS s(pos)
      LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[s.pos]
      WHERE n.nspname = 'public'
      GROUP BY n.nspname, t.relname, t.relkind, c.relname, c.relkind, am.amname, i.indisunique, i.indisvalid, i.indisready, i.indnatts, i.indnkeyatts, i.indexprs, i.indpred
    )
    SELECT 
      e.tbl_name, 
      e.idx_name, 
      e.key_atts,
      e.expected_cols, 
      a.actual_cols, 
      a.access_method,
      a.indisunique,
      a.indisvalid, 
      a.indisready,
      a.indnatts,
      a.indnkeyatts,
      a.has_expressions,
      a.is_partial
    FROM expected_indexes e
    LEFT JOIN actual_indexes a 
      ON a.tbl_name = e.tbl_name 
     AND a.idx_name = e.idx_name
  ) LOOP
    IF v_record.indisvalid IS NULL OR v_record.indisvalid = false OR v_record.indisready = false THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" on table "%" is missing or invalid', v_record.idx_name, v_record.tbl_name;
    END IF;

    IF v_record.access_method <> 'btree' THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" access method is "%" (expected btree)', v_record.idx_name, v_record.access_method;
    END IF;

    IF v_record.indisunique = true THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" is unique (expected non-unique)', v_record.idx_name;
    END IF;

    IF v_record.indnatts <> v_record.key_atts OR v_record.indnkeyatts <> v_record.key_atts THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" attribute counts mismatch! indnatts=%, indnkeyatts=%, expected=%',
        v_record.idx_name, v_record.indnatts, v_record.indnkeyatts, v_record.key_atts;
    END IF;

    IF v_record.has_expressions = true THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" has expressions (expected simple key columns)', v_record.idx_name;
    END IF;

    IF v_record.is_partial = true THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" is partial (expected full index)', v_record.idx_name;
    END IF;

    IF v_record.actual_cols <> v_record.expected_cols THEN
      RAISE EXCEPTION 'VERIFICATION FAILED: Index "public"."%" column signature mismatch! Expected: [%], Actual: [%]', 
        v_record.idx_name, v_record.expected_cols, v_record.actual_cols;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  IF v_count <> 5 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: Expected 5 verified indexes, but verified %', v_count;
  END IF;

  RAISE NOTICE 'SUCCESS: All 5 M4 performance indexes verified valid, ready, btree, non-unique, zero-include, and exact.';
END $$;

