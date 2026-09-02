import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const triggerMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260901090000_fix_creciendo_anthropometry_source_note.sql",
);
const replayMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260901091000_fix_creciendo_anthropometry_source_note_replay.sql",
);

describe("Creciendo anthropometry source-note migration", () => {
  it("keeps history immutable except for the one-time source-note enrichment", () => {
    expect(existsSync(triggerMigrationPath)).toBe(true);
    expect(existsSync(replayMigrationPath)).toBe(true);
    const sql = readFileSync(triggerMigrationPath, "utf8").toLowerCase();
    const replaySql = readFileSync(replayMigrationPath, "utf8").toLowerCase();

    expect(sql).toContain("old.source_note is null");
    expect(sql).toContain("new.source_note is not null");
    expect(sql).toContain("to_jsonb(old) - 'source_note'");
    expect(sql).toContain("to_jsonb(new) - 'source_note'");
    expect(replaySql).toContain("if p_source_note is not null and result.outcome = 'created' then");
    expect(sql).toContain("anthropometry_history_immutable");
  });
});
