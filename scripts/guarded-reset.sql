\set ON_ERROR_STOP on

-- ============================================================================
-- GATE 1: Verify opt-in variable presence and boolean value using psql \if
-- ============================================================================
\if :{?opt_in}
  -- Variable defined
\else
  \echo 'SAFETY ABORT: -v opt_in is missing. Pass -v opt_in=true to proceed.'
  \q 1
\endif

\if :opt_in
  -- opt_in is true, continue
\else
  \echo 'SAFETY ABORT: opt_in is false. Refusing destructive operations.'
  \q 1
\endif

-- ============================================================================
-- GATE 2: Verify expected cluster system_identifier presence using psql \if
-- ============================================================================
\if :{?expected_sys_id}
  -- Variable defined
\else
  \echo 'SAFETY ABORT: -v expected_sys_id is missing. Mandatory trusted cluster identifier required.'
  \q 1
\endif

-- ============================================================================
-- GATE 3: Session-level setting outside $$ blocks
-- ============================================================================
SET m4.expected_system_identifier = :'expected_sys_id';

-- ============================================================================
-- GATE 4: Comprehensive Identity & Catalog Guard in PL/pgSQL
-- ============================================================================
DO $$
DECLARE
  v_expected_sys_id text := current_setting('m4.expected_system_identifier', true);
  v_current_db      text := current_database();
  v_server_addr     inet := inet_server_addr();
  v_version         text := version();
  v_current_user    text := current_user;
  v_actual_sys_id   text;
BEGIN
  -- 1. Validate expected cluster identifier
  IF v_expected_sys_id IS NULL OR length(trim(v_expected_sys_id)) < 5 THEN
    RAISE EXCEPTION 'SAFETY ABORT: Expected cluster identifier is empty or invalid: "%"', v_expected_sys_id;
  END IF;

  -- 2. Maintenance database check
  IF v_current_db NOT IN ('postgres', 'template1') THEN
    RAISE EXCEPTION 'SAFETY ABORT: Teardown must run from maintenance DB (postgres/template1). Current: "%"', v_current_db;
  END IF;

  -- 3. Cloud engine rejection
  IF v_version ~* '(aurora|neon\.tech|rds\.amazonaws\.com|azure|cockroach|google cloud)' THEN
    RAISE EXCEPTION 'SAFETY ABORT: Prohibited cloud engine detected: %', v_version;
  END IF;

  -- 4. Production user rejection
  IF v_current_user ~* '(prod|production|stage|staging|live)' THEN
    RAISE EXCEPTION 'SAFETY ABORT: Production user detected: %', v_current_user;
  END IF;

  -- 5. Anti-tunnel server IP check (UNCONDITIONALLY rejects NULL Unix domain sockets)
  IF v_server_addr IS NULL THEN
    RAISE EXCEPTION 'SAFETY ABORT: inet_server_addr() is NULL (Unix domain socket). Unix domain sockets are rejected unconditionally. TCP loopback (127.0.0.1) is required.';
  END IF;

  IF v_server_addr NOT IN ('127.0.0.1'::inet, '::1'::inet)
     AND NOT (v_server_addr <<= '172.16.0.0/12'::cidr OR v_server_addr <<= '10.0.0.0/8'::cidr) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Server address % indicates remote connection or tunnel forward', v_server_addr;
  END IF;

  -- 6. Mandatory cluster identity matching
  SELECT system_identifier::text INTO STRICT v_actual_sys_id FROM pg_control_system();
  IF v_actual_sys_id <> v_expected_sys_id THEN
    RAISE EXCEPTION 'SAFETY ABORT: Cluster identity mismatch! Cluster has %, expected %', v_actual_sys_id, v_expected_sys_id;
  END IF;

  RAISE NOTICE 'SAFETY PREFLIGHT PASSED: Local cluster % confirmed.', v_actual_sys_id;
END $$;

-- ============================================================================
-- DESTRUCTIVE STATEMENTS (Guaranteed unreachable if any preflight check fails)
-- ============================================================================
DROP DATABASE IF EXISTS driver_complaint_m4_disposable WITH (FORCE);
CREATE DATABASE driver_complaint_m4_disposable;

