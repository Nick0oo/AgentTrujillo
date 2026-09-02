import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = resolve(process.cwd(), "supabase/migrations/20260902110000_activate_growth_clinical_packages.sql");
const PGTAP = resolve(process.cwd(), "supabase/tests/048_growth_clinical_packages.test.sql");

const EXACT_DIGESTS = [
  "8f224f2e43833d289be4f089d04f945c7927a84981a6c5f29ea338513c6a0f9b",
  "f1d92614b3627e8f4a65d536d50dfbd1e947fb870e4a6ce291903b9a578ccf6c",
  "bb259ea0bb6a0538e93ab9143fc9f0f2501a56aa296f4d76ba006bda7ac757a7",
  "1cca51d539c7c44519da5111e17fbf06ed9f6e7143c4f0a84366329a446a32da",
  "10bc1a538d4e2516cd01fb7450ffe45fba29ade7b6db428b5711f6a2161523ca",
  "57be10bf36b3fe0a39335c9618fff1a521addeb7c6fa4e867b641b8c1d60d430",
  "30b6d302ac00b770a4d564994afb2c918803e34bc3d71408996d22ae20544089",
  "d71673e49bd8c82baa321e0a994c07d992c9889f0ace98e8670a678004690517",
  "0f23f7f0f9c996ebea5a64459ee21aa9388ae46664c7992bbed939d69e619d43",
] as const;

describe("governed growth package migration", () => {
  it("registers exact conveyed approvals and two deterministic releases", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const sql = readFileSync(MIGRATION, "utf8");
    const lower = sql.toLowerCase();

    for (const digest of EXACT_DIGESTS) expect(sql).toContain(digest);
    expect(sql).toContain("growth-co-who-v1");
    expect(sql).toContain("growth-us-who-cdc-v1");
    expect(sql.match(/app_private\.activate_clinical_package\(/gu)).toHaveLength(2);
    expect(sql.match(/product_owner_conveyed/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(lower).toContain("approver_subject");
    expect(lower).toContain("approver_user_id");
    expect(lower).toContain("on conflict");
    expect(lower).not.toMatch(/\b(?:drop|truncate)\s+(?:table|schema)|\bdelete\s+from\b/u);
    expect(lower).not.toContain("repeat('");
    expect(lower).not.toContain("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("ships a local pgTAP gate for exact country and source isolation", () => {
    expect(existsSync(PGTAP)).toBe(true);
    const sql = readFileSync(PGTAP, "utf8").toLowerCase();
    expect(sql).toContain("growth-co-who-v1");
    expect(sql).toContain("growth-us-who-cdc-v1");
    expect(sql).toContain("product_owner_conveyed");
    expect(sql).toContain("approver_subject is null");
    expect(sql).toContain("approver_user_id is null");
    expect(sql).toContain("cdc_nchs");
    expect(sql).toContain("who");
    expect(sql).toContain("rollback");
  });
});
