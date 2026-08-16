import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_MIGRATIONS = [
  "20260814000000_platform_foundation.sql",
  "20260814000100_pediatric_modules.sql",
  "20260814000200_agent_commerce_storage_security.sql",
  "20260816010000_session_scope_hardening.sql",
  "20260816020000_agent_command_idempotency.sql",
  "20260816030000_vector_scope_hardening.sql",
  "20260816040000_realtime_publication_hardening.sql",
  "20260816050000_authorized_child_scope_rpc.sql",
  "20260816060000_session_ownership_rpcs.sql",
];

export const EXPECTED_PARITY = {
  migrationCount: 9,
  tableCount: 57,
  bucketCount: 5,
  rlsForcedCount: 57,
  checksum: "sha256:347b5d136f46a91fe4f792eb4e8a4910576e9b99462e08cebe2a4a92a686da01",
};

const VOLATILE_KEYS = new Set([
  "capturedAt",
  "comment",
  "createdAt",
  "oid",
  "owner",
  "updatedAt",
]);

const LOCAL_UNAVAILABLE_PATTERNS = [
  /docker/i,
  /pipe[\\/].*docker/i,
  /connection refused/i,
  /cannot find the path/i,
  /not running/i,
  /start supabase/i,
];

function stableValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(stableValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function normalizeSchemaProjection(projection) {
  return stableValue(projection);
}

function checksumFor(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(normalizeSchemaProjection(value))).digest("hex")}`;
}

export function validateMigrationInventory(migrations) {
  if (!Array.isArray(migrations)) {
    return { ok: false, category: "SCHEMA_DRIFT", reason: "migration inventory is not an array" };
  }
  const exact = migrations.length === EXPECTED_MIGRATIONS.length
    && migrations.every((migration, index) => migration === EXPECTED_MIGRATIONS[index]);
  return exact
    ? { ok: true, migrations: [...migrations] }
    : {
        ok: false,
        category: "SCHEMA_DRIFT",
        reason: "active migration inventory differs from the reviewed baseline",
        expected: [...EXPECTED_MIGRATIONS],
        actual: [...migrations],
      };
}

function sameProjection(left, right) {
  return JSON.stringify(normalizeSchemaProjection(left)) === JSON.stringify(normalizeSchemaProjection(right));
}

export function redactOutput(value) {
  return String(value ?? "")
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s"']+/gi, "[REDACTED]")
    .replace(/(?:[A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|KEY|ACCESS_TOKEN|SERVICE_ROLE|ANON_KEY))\s*[=:]\s*[^\s,;]+/gi, (match) => `${match.split(/[=:]/, 1)[0]}=[REDACTED]`)
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]");
}

export function evaluateParity(actual, expected) {
  if (actual?.cliVersion && expected?.cliVersion && actual.cliVersion !== expected.cliVersion) {
    return {
      ok: false,
      category: "CLI_VERSION_MISMATCH",
      expected: expected.cliVersion,
      actual: actual.cliVersion,
    };
  }
  if (actual?.commandExitCode !== undefined && actual.commandExitCode !== 0) {
    return {
      ok: false,
      category: "COMMAND_FAILED",
      exitCode: actual.commandExitCode,
      stderr: redactOutput(actual.commandStderr),
    };
  }

  const fields = ["migrationCount", "tableCount", "bucketCount", "rlsForcedCount", "checksum"];
  const drift = fields.find((field) => actual?.[field] !== expected?.[field]);
  if (drift || (actual?.projection && expected?.projection && !sameProjection(actual.projection, expected.projection))) {
    return {
      ok: false,
      category: "SCHEMA_DRIFT",
      field: drift ?? "projection",
      expected: drift ? expected?.[drift] : "normalized projection",
      actual: drift ? actual?.[drift] : "different normalized projection",
    };
  }

  return {
    ok: true,
    migrationCount: actual.migrationCount,
    tableCount: actual.tableCount,
    bucketCount: actual.bucketCount,
    rlsForcedCount: actual.rlsForcedCount,
    checksum: actual.checksum,
  };
}

export function buildLocalCommandPlan() {
  return [
    ["supabase", "--version"],
    ["supabase", "status"],
    ["supabase", "db", "reset", "--local", "--no-seed"],
    ["supabase", "test", "db", "--local", "supabase/tests"],
    ["supabase", "db", "lint", "--local", "--schema", "public,storage", "--level", "warning"],
    ["supabase", "migration", "list", "--local"],
    ["supabase", "db", "diff", "--local"],
  ];
}

export function assertLocalOnlyArgs(args) {
  const serialized = args.join(" ").toLowerCase();
  if (
    serialized.includes("--linked")
    || serialized.includes("--db-url")
    || serialized.includes("--project-ref")
    || serialized.includes("--password")
    || serialized.includes("db push")
    || serialized.includes("migration push")
  ) {
    throw new Error("forbidden remote or destructive Supabase arguments");
  }
}

export function isAllowedManagedWarning(functionName, owner) {
  return functionName === "storage.search_by_timestamp" && owner === "managed";
}

function cliCommand(args) {
  assertLocalOnlyArgs(args.slice(1));
  if (process.platform !== "win32") return { command: "npx", prefix: [] };
  return { command: join(dirname(process.execPath), "npx.cmd"), prefix: [] };
}

function runLocalCommand(args, { timeout = 120_000, capture = true } = {}) {
  const { command, prefix } = cliCommand(args);
  const commandArgs = [...prefix, "--no-install", ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "ignore", "ignore"],
    timeout,
    windowsHide: true,
    shell: process.platform === "win32",
  });
  return {
    args,
    status: result.status ?? 1,
    stdout: capture ? redactOutput(result.stdout) : "",
    stderr: capture ? redactOutput(result.stderr || result.error?.message) : "",
  };
}

function isLocalUnavailable(result) {
  return LOCAL_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(`${result.stdout}\n${result.stderr}`));
}

function parseVersion(output) {
  return String(output).match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? null;
}

function parseJsonObject(output) {
  const text = String(output ?? "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseMigrationNames(output) {
  const directNames = [...String(output).matchAll(/\b\d{14}_[A-Za-z0-9_-]+\.sql\b/g)].map(([name]) => name);
  if (directNames.length > 0) return directNames;

  const parsed = parseJsonObject(output);
  const versions = parsed?.migrations
    ?.map((migration) => String(migration.local ?? ""))
    .filter((version) => /^\d{14}$/.test(version));
  if (!versions?.length) return [];

  const migrationFiles = readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((name) => /^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(name));
  return versions.map((version) => migrationFiles.find((name) => name.startsWith(`${version}_`)) ?? `${version}.sql`);
}

const PROJECTION_QUERY = "select json_build_object('tables', coalesce((select json_agg(json_build_object('schema', table_schema, 'name', table_name) order by table_schema, table_name) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'), '[]'::json), 'buckets', coalesce((select json_agg(json_build_object('id', id, 'public', public) order by id) from storage.buckets), '[]'::json), 'extensions', coalesce((select json_agg(json_build_object('schema', n.nspname, 'name', e.extname, 'version', e.extversion) order by n.nspname, e.extname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'), '[]'::json), 'publications', coalesce((select json_agg(json_build_object('publication', p.pubname, 'table', c.relname) order by p.pubname, c.relname) from pg_publication p join pg_publication_rel pr on pr.prpubid = p.oid join pg_class c on c.oid = pr.prrelid), '[]'::json), 'grants', coalesce((select json_agg(json_build_object('grantee', grantee, 'schema', table_schema, 'table', table_name, 'privilege', privilege_type) order by grantee, table_schema, table_name, privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')), '[]'::json), 'rlsForcedCount', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity)) as projection;";

function unwrapProjection(value) {
  if (!value || typeof value !== "object") return null;
  if (value.projection && typeof value.projection === "object") return value.projection;
  if (Array.isArray(value) && value[0]?.projection) return value[0].projection;
  if (value.rows && Array.isArray(value.rows) && value.rows[0]?.projection) return value.rows[0].projection;
  if (value.data && Array.isArray(value.data) && value.data[0]?.projection) return value.data[0].projection;
  return null;
}

export function runLocalParity() {
  const version = runLocalCommand(["supabase", "--version"]);
  if (version.status !== 0) {
    return { ok: false, category: "COMMAND_FAILED", exitCode: version.status, stderr: version.stderr };
  }
  const cliVersion = parseVersion(version.stdout || version.stderr);

  // Status is an informational readiness probe. The reset below is the authoritative
  // local-stack gate because `supabase status` can race service health checks on startup.
  runLocalCommand(["supabase", "status"]);

  for (const args of [
    ["supabase", "db", "reset", "--local", "--no-seed", "--yes"],
    ["supabase", "test", "db", "--local", "supabase/tests"],
    ["supabase", "db", "lint", "--local", "--schema", "public,storage", "--level", "warning"],
    ["supabase", "migration", "list", "--local"],
    ["supabase", "db", "diff", "--local"],
  ]) {
    const result = runLocalCommand(args, { capture: !args.includes("diff") });
    if (result.status !== 0) {
      return {
        ok: false,
        category: isLocalUnavailable(result) ? "LOCAL_SUPABASE_UNAVAILABLE" : "COMMAND_FAILED",
        exitCode: result.status,
        cliVersion,
        command: result.args,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
  }

  const migrationList = runLocalCommand(["supabase", "migration", "list", "--local"]);
  const migrations = parseMigrationNames(migrationList.stdout);
  const inventory = validateMigrationInventory(migrations);
  if (!inventory.ok) return inventory;

  const query = runLocalCommand(["supabase", "db", "query", "--local", "--output-format", "json", PROJECTION_QUERY]);
  if (query.status !== 0) {
    return {
      ok: false,
      category: isLocalUnavailable(query) ? "LOCAL_SUPABASE_UNAVAILABLE" : "COMMAND_FAILED",
      exitCode: query.status,
      cliVersion,
      stderr: query.stderr,
    };
  }
  const projection = unwrapProjection(parseJsonObject(query.stdout));
  if (!projection) {
    return { ok: false, category: "COMMAND_FAILED", cliVersion, stderr: "local schema projection was not valid JSON" };
  }

  const normalized = normalizeSchemaProjection({ ...projection, migrations });
  const actual = {
    migrationCount: migrations.length,
    tableCount: normalized.tables?.length ?? 0,
    bucketCount: normalized.buckets?.length ?? 0,
    rlsForcedCount: normalized.rlsForcedCount ?? 0,
    checksum: checksumFor(normalized),
    projection: normalized,
    cliVersion,
  };
  return evaluateParity(actual, { ...EXPECTED_PARITY, cliVersion });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = runLocalParity();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
