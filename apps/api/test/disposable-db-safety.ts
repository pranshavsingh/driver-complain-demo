import { PrismaClient } from '@prisma/client';
import { URL } from 'url';

export interface PreflightConfig {
  maintenanceUrl: string;
  disposableAppUrl: string;
  expectedClusterSysId: string;
}

export interface DisposableSafetyReport {
  systemIdentifier: string;
  serverAddr: string;
  serverPort: number;
  currentDatabase: string;
  currentUser: string;
}

const PERMITTED_DISPOSABLE_DB = 'driver_complaint_m4_disposable';
const PROHIBITED_KEYWORDS = [
  'prod', 'production', 'stage', 'staging', 'live',
  'neon.tech', 'rds.amazonaws.com', 'aws', 'supabase.co',
  'elephantsql', 'cloudsql', 'render.com', 'cockroachlabs'
];

/**
 * Sanitizes URLs for logging and error reporting by stripping user/password credentials.
 */
export function sanitizeUrlForLogging(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    const authPart = parsed.username ? '***@' : '';
    return `${parsed.protocol}//${authPart}${parsed.host}${parsed.pathname}`;
  } catch {
    return '[REDACTED MALFORMED URL]';
  }
}

/**
 * Validates protocol, host, port, database name, and blacklisted keywords prior to connection.
 */
export function validateUrlPreflight(urlString: string, expectedRole: 'maintenance' | 'disposable_app'): URL {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error(`SAFETY ABORT: Missing URL string for role "${expectedRole}"`);
  }

  // Reject fallback to production application DATABASE_URL
  if (process.env.DATABASE_URL && urlString === process.env.DATABASE_URL) {
    throw new Error('SAFETY ABORT: Cannot use production application DATABASE_URL for destructive operations');
  }

  const sanitized = sanitizeUrlForLogging(urlString);
  const lower = urlString.toLowerCase();
  for (const kw of PROHIBITED_KEYWORDS) {
    if (lower.includes(kw)) {
      throw new Error(`SAFETY ABORT: URL contains prohibited keyword "${kw}": ${sanitized}`);
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch (_err) {
    throw new Error(`SAFETY ABORT: Malformed URL for role "${expectedRole}": ${sanitized}`);
  }

  // Validate protocol
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`SAFETY ABORT: Protocol must be postgresql: or postgres:. Found "${parsed.protocol}" in ${sanitized}`);
  }

  // Validate host
  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`SAFETY ABORT: Host must strictly be localhost or 127.0.0.1. Found: "${host}" in ${sanitized}`);
  }

  // Validate port
  const expectedPort = process.env.M4_TEST_DB_PORT || '5432';
  const actualPort = parsed.port || '5432';
  if (actualPort !== expectedPort) {
    throw new Error(`SAFETY ABORT: Port must strictly be ${expectedPort}. Found "${actualPort}" in ${sanitized}`);
  }

  // Validate database name
  const dbName = parsed.pathname.replace(/^\//, '');
  if (expectedRole === 'maintenance' && !['postgres', 'template1'].includes(dbName)) {
    throw new Error(`SAFETY ABORT: Maintenance DB must be "postgres" or "template1". Found: "${dbName}" in ${sanitized}`);
  }
  if (expectedRole === 'disposable_app' && dbName !== PERMITTED_DISPOSABLE_DB) {
    throw new Error(`SAFETY ABORT: Application DB must strictly be "${PERMITTED_DISPOSABLE_DB}". Found: "${dbName}" in ${sanitized}`);
  }

  return parsed;
}

/**
 * Validates session properties and server IP.
 * Rejects NULL server address (Unix domain sockets) unconditionally.
 */
function validateSessionProperties(meta: any, sanitizedUrl: string): void {
  const serverVer = (meta.ver ?? '').toLowerCase();
  const currentUser = (meta.usr ?? '').toLowerCase();
  const serverAddr: string | null = meta.addr ?? null;

  for (const cloud of ['aurora', 'neon', 'rds', 'azure', 'cockroach', 'google cloud']) {
    if (serverVer.includes(cloud)) {
      throw new Error(`SAFETY ABORT: Prohibited cloud database detected: ${meta.ver}`);
    }
  }

  if (currentUser.includes('prod') || currentUser.includes('live')) {
    throw new Error(`SAFETY ABORT: Production user detected: ${meta.usr}`);
  }

  // Server address checks: Unconditionally reject Unix domain sockets (NULL)
  if (serverAddr === null) {
    throw new Error(
      `SAFETY ABORT: inet_server_addr() is NULL (Unix domain socket). Unix domain sockets are rejected unconditionally in destructive test paths. TCP loopback (127.0.0.1) is required.`
    );
  }

  const cleanAddr = (serverAddr || '').split('/')[0] ?? '';
  const isLoopback = cleanAddr === '127.0.0.1' || cleanAddr === '::1';
  const isDocker = /^172\.(1[6-9]|2\d|3[01])\./.test(cleanAddr) || cleanAddr.startsWith('10.');
  if (!isLoopback && !isDocker) {
    throw new Error(`SAFETY ABORT: Non-local server IP "${serverAddr}". Remote host or tunnel detected for ${sanitizedUrl}`);
  }
}

/**
 * Executes guarded database reset.
 * All preflight checks execute BEFORE DROP. Identity verified AFTER recreation.
 */
export async function executeGuardedDatabaseReset(config: PreflightConfig): Promise<{ maintReport: DisposableSafetyReport; appReport: DisposableSafetyReport }> {
  // Step 1: Explicit opt-in flag
  if (process.env.M4_ALLOW_DESTRUCTIVE_TEST_DB !== 'true') {
    throw new Error('SAFETY ABORT: M4_ALLOW_DESTRUCTIVE_TEST_DB must be strictly set to "true"');
  }

  // Step 2: Mandatory trusted cluster identifier
  const expectedSysId = config.expectedClusterSysId?.trim();
  if (!expectedSysId || expectedSysId.length < 5) {
    throw new Error('SAFETY ABORT: Mandatory expected cluster system_identifier must be provided from trusted config');
  }

  // Step 3: Validate BOTH URLs before any connection or destructive action
  validateUrlPreflight(config.maintenanceUrl, 'maintenance');
  validateUrlPreflight(config.disposableAppUrl, 'disposable_app');

  const sanitizedMaintUrl = sanitizeUrlForLogging(config.maintenanceUrl);
  const sanitizedAppUrl = sanitizeUrlForLogging(config.disposableAppUrl);

  // Step 4: Connect to Maintenance DB via PrismaClient and verify cluster identity BEFORE DROP
  const maintClient = new PrismaClient({ datasourceUrl: config.maintenanceUrl });
  await maintClient.$connect();

  let maintReport: DisposableSafetyReport;
  try {
    const metaRows = await maintClient.$queryRawUnsafe<any[]>(`
      SELECT 
        current_database() AS db,
        current_user AS usr,
        host(inet_server_addr()) AS addr,
        inet_server_port() AS port,
        version() AS ver
    `);
    const meta = metaRows[0];

    if (!['postgres', 'template1'].includes(meta.db)) {
      throw new Error(`SAFETY ABORT: Maintenance client connected to non-maintenance database "${meta.db}"`);
    }

    validateSessionProperties(meta, sanitizedMaintUrl);

    const sysRows = await maintClient.$queryRawUnsafe<any[]>('SELECT system_identifier::text AS sys_id FROM pg_control_system()');
    const maintSysId = sysRows[0]?.sys_id;

    if (!maintSysId || maintSysId !== expectedSysId) {
      throw new Error(
        `SAFETY ABORT: Maintenance cluster identity mismatch! Expected "${expectedSysId}", found "${maintSysId}"`
      );
    }

    maintReport = {
      systemIdentifier: maintSysId,
      serverAddr: meta.addr,
      serverPort: meta.port,
      currentDatabase: meta.db,
      currentUser: meta.usr,
    };

    // Step 5: ONLY NOW execute DROP and CREATE
    await maintClient.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = '${PERMITTED_DISPOSABLE_DB}' 
        AND pid <> pg_backend_pid();
    `);
    await maintClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${PERMITTED_DISPOSABLE_DB} WITH (FORCE);`);
    await maintClient.$executeRawUnsafe(`CREATE DATABASE ${PERMITTED_DISPOSABLE_DB};`);
  } finally {
    await maintClient.$disconnect();
  }

  // Step 6: Connect to recreated Application DB and verify identity
  const appClient = new PrismaClient({ datasourceUrl: config.disposableAppUrl });
  await appClient.$connect();

  let appReport: DisposableSafetyReport;
  try {
    const appMetaRows = await appClient.$queryRawUnsafe<any[]>(`
      SELECT 
        current_database() AS db,
        current_user AS usr,
        host(inet_server_addr()) AS addr,
        inet_server_port() AS port,
        version() AS ver
    `);
    const appMeta = appMetaRows[0];

    if (appMeta.db !== PERMITTED_DISPOSABLE_DB) {
      throw new Error(`SAFETY ABORT: Target database is "${appMeta.db}", expected "${PERMITTED_DISPOSABLE_DB}"`);
    }

    validateSessionProperties(appMeta, sanitizedAppUrl);

    const appSysRows = await appClient.$queryRawUnsafe<any[]>('SELECT system_identifier::text AS sys_id FROM pg_control_system()');
    const appSysId = appSysRows[0]?.sys_id;

    if (appSysId !== expectedSysId || appSysId !== maintReport.systemIdentifier) {
      throw new Error(
        `SAFETY ABORT: Application cluster identity mismatch! Expected "${expectedSysId}", found "${appSysId}"`
      );
    }

    appReport = {
      systemIdentifier: appSysId,
      serverAddr: appMeta.addr,
      serverPort: appMeta.port,
      currentDatabase: appMeta.db,
      currentUser: appMeta.usr,
    };
  } finally {
    await appClient.$disconnect();
  }

  return { maintReport, appReport };
}
