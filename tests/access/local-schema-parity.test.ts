import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error This executable module intentionally has no declaration file.
const parity = await import("../../scripts/verify-supabase-parity.mjs");

const expectedMigrations = [
  "20260814000000_platform_foundation.sql",
  "20260814000100_pediatric_modules.sql",
  "20260814000200_agent_commerce_storage_security.sql",
  "20260816010000_session_scope_hardening.sql",
  "20260816020000_agent_command_idempotency.sql",
  "20260816030000_vector_scope_hardening.sql",
  "20260816040000_realtime_publication_hardening.sql",
  "20260816050000_authorized_child_scope_rpc.sql",
  "20260816060000_session_ownership_rpcs.sql",
  "20260816070000_session_lease_refresh_hardening.sql",
  "20260816080000_session_bind_authorization_hardening.sql",
  "20260816090000_session_authorization_race_hardening.sql",
];

const expected = {
  migrationCount: 12,
  tableCount: 57,
  bucketCount: 5,
  rlsForcedCount: 57,
  checksum: "sha256:81d031fbbdd5c1851dd71317c4ed2d4f7ef4076573b3eecdae6cdc9d5783a550",
  migrationChecksum: "sha256:4cf1f204a647e236b80a0c48877576f5d165d526ce8cca27ddc8fb216ca6fc97",
};

const expectedProjection = {
  migrations: expectedMigrations,
  tables: [
    { schema: "public", name: "care_spaces" },
    { schema: "public", name: "children" },
  ],
  buckets: [
    { id: "avatars", public: false },
    { id: "clinical-attachments", public: false },
  ],
  extensions: [{ schema: "extensions", name: "vector", version: "0.8.0" }],
  publications: [],
  grants: [{ grantee: "anon", schema: "public", table: "care_spaces", privilege: "SELECT" }],
};

describe("local Supabase parity gate", () => {
  it("accepts exactly the three active migrations in ascending order", () => {
    expect(parity.validateMigrationInventory(expectedMigrations)).toEqual({
      ok: true,
      migrations: expectedMigrations,
    });
  });

  it("rejects missing, extra, reordered, and legacy migration paths", () => {
    expect(parity.validateMigrationInventory(expectedMigrations.slice(0, 2)).ok).toBe(false);
    expect(parity.validateMigrationInventory([...expectedMigrations, "20260901000000_extra.sql"]).ok).toBe(false);
    expect(parity.validateMigrationInventory([expectedMigrations[1], expectedMigrations[0], expectedMigrations[2]]).ok).toBe(false);
    expect(parity.validateMigrationInventory(["supabase/legacy-reference/old.sql"]).ok).toBe(false);
  });

  it("normalizes volatile schema fields and stable-sorts projection members", () => {
    const noisy = {
      ...expectedProjection,
      tables: [
        { schema: "public", name: "children", owner: "postgres", oid: 20, comment: "volatile" },
        { schema: "public", name: "care_spaces", owner: "postgres", oid: 10, comment: "volatile" },
      ],
      capturedAt: "2026-08-16T00:00:00.000Z",
    };
    expect(parity.normalizeSchemaProjection(noisy)).toEqual({
      ...expectedProjection,
      tables: expectedProjection.tables,
    });
  });

  it("produces the same normalized checksum for reordered volatile input", () => {
    const first = parity.normalizeSchemaProjection(expectedProjection);
    const second = parity.normalizeSchemaProjection({
      ...expectedProjection,
      tables: [...expectedProjection.tables].reverse(),
      buckets: [...expectedProjection.buckets].reverse(),
    });
    expect(parity.evaluateParity({ ...expected, projection: first }, { ...expected, projection: second })).toMatchObject({ ok: true });
  });

  it("returns the reviewed parity result for expected counts and checksum", () => {
    expect(parity.evaluateParity(expected, expected)).toEqual({ ok: true, migrationCount: 12, tableCount: 57, bucketCount: 5, rlsForcedCount: 57, checksum: expected.checksum, migrationChecksum: expected.migrationChecksum });
  });

  it("reports bounded schema drift for count, checksum, and migration mismatches", () => {
    expect(parity.evaluateParity({ ...expected, tableCount: 55 }, expected)).toMatchObject({ ok: false, category: "SCHEMA_DRIFT" });
    expect(parity.evaluateParity({ ...expected, checksum: "sha256:other" }, expected)).toMatchObject({ ok: false, category: "SCHEMA_DRIFT" });
    expect(parity.evaluateParity({ ...expected, migrationCount: 2 }, expected)).toMatchObject({ ok: false, category: "SCHEMA_DRIFT" });
  });

  it("classifies CLI version and command failures without leaking output", () => {
    expect(parity.evaluateParity({ ...expected, cliVersion: "2.113.0" }, { ...expected, cliVersion: "2.114.0" })).toMatchObject({ ok: false, category: "CLI_VERSION_MISMATCH" });
    const failure = parity.evaluateParity({ ...expected, commandExitCode: 1, commandStderr: "password=top-secret postgres://user:secret@host/db" }, expected);
    expect(failure).toMatchObject({ ok: false, category: "COMMAND_FAILED" });
    expect(JSON.stringify(failure)).not.toContain("top-secret");
  });

  it("redacts URLs, tokens, keys, and passwords from bounded output", () => {
    const redacted = parity.redactOutput("postgres://user:secret@host/db token=abc123 SUPABASE_ACCESS_TOKEN=xyz");
    expect(redacted).not.toMatch(/secret|abc123|xyz/i);
    expect(redacted).toContain("[REDACTED]");
  });

  it("builds only local, non-destructive command plans", () => {
    const commands = parity.buildLocalCommandPlan();
    expect(commands).toEqual(expect.arrayContaining([
      ["supabase", "--version"],
      ["supabase", "status"],
      ["supabase", "db", "reset", "--local", "--no-seed"],
      ["supabase", "test", "db", "--local", "supabase/tests"],
      ["supabase", "db", "lint", "--local", "--schema", "public,storage", "--level", "warning"],
      ["supabase", "migration", "list", "--local"],
      ["supabase", "db", "diff", "--local"],
    ]));
    expect(JSON.stringify(commands)).not.toMatch(/--linked|db push|--db-url|--project-ref/i);
  });

  it("rejects remote or destructive arguments before process spawn", () => {
    for (const args of [["db", "reset", "--linked"], ["db", "push"], ["db", "reset", "--db-url", "postgres://x"], ["migration", "list", "--linked"]]) {
      expect(() => parity.assertLocalOnlyArgs(args)).toThrow(/local|remote|forbidden/i);
    }
  });

  it("allowlists the exact known Supabase-managed lint warning", () => {
    expect(parity.isAllowedManagedWarning("storage.search_by_timestamp", "managed")).toBe(true);
    expect(parity.isAllowedManagedWarning("public.some_application_function", "managed")).toBe(false);
    expect(parity.isAllowedManagedWarning("storage.search_by_timestamp", "application")).toBe(false);
  });

  it("keeps the evidence document and package entry in the declared scope", () => {
    expect(existsSync(resolve(process.cwd(), "docs/verification/supabase-local-parity.md"))).toBe(true);
    expect(readFileSync(resolve(process.cwd(), "package.json"), "utf8")).toContain("verify:supabase-parity");
  });

  it.skipIf(process.env.RUN_LOCAL_SUPABASE_INTEGRATION !== "1")("runs the full local command when Docker is explicitly enabled", () => {
    expect(parity.runLocalParity()).toMatchObject({ ok: true });
  });
});
