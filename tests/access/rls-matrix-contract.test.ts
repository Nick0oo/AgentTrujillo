import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = readFileSync("docs/verification/access-denial-matrix.md", "utf8");
const sql = readFileSync("supabase/tests/010_access_isolation.test.sql", "utf8");

const categories = ["Authorized", "sibling/no-access", "foreign-space", "revoked", "expired", "wrong-permission", "anonymous"];
const requiredResources = [
  "care_spaces",
  "care_space_members",
  "children",
  "child_access",
  "documents",
  "agent_sessions",
  "messages",
  "clinical_memory_items",
  "clinical_memory_embeddings",
  "conversation_summaries",
  "entitlements",
  "storage.objects",
  "match_clinical_memory",
];

describe("negative RLS matrix contract", () => {
  it("declares every principal category and complete outcome cells", () => {
    for (const category of categories) expect(matrix).toContain(`| ${category} |`);
    const rows = matrix.split("\n").filter((line) => line.startsWith("| `") && line.split("|").length === 12);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      const cells = row.split("|").slice(2, 9);
      for (const cell of cells) expect(cell).toMatch(/allow|zero[_ ]rows|permission[_ ]denied/);
    }
    for (const resource of requiredResources) expect(matrix).toContain(`| \`${resource}`);
  });

  it("uses synthetic fixtures, rollback, explicit roles, and no skipped assertions", () => {
    expect(sql).toContain("begin;");
    expect(sql).toContain("select plan(45);");
    expect(sql).toContain("select * from finish();");
    expect(sql).toContain("rollback;");
    expect(sql).toContain("set local role authenticated;");
    expect(sql).toContain("set local role anon;");
    expect(sql).toContain("set_config('request.jwt.claim.sub'");
    expect(sql).toContain("throws_ok(");
    expect(sql).not.toMatch(/skip|TODO|\.env|--linked|service_role/i);
    expect((sql.match(/00000000-0000-0000-0000-000000000[0-9]{3}/g) ?? []).length).toBeGreaterThanOrEqual(20);
  });

  it("balances role resets and declares the planned assertion count", () => {
    expect((sql.match(/set local role authenticated;/g) ?? []).length + (sql.match(/set local role anon;/g) ?? []).length).toBe((sql.match(/set local role postgres;/g) ?? []).length);
    expect((sql.match(/select ok\(/g) ?? []).length + (sql.match(/select throws_ok\(/g) ?? []).length).toBe(45);
  });
});
