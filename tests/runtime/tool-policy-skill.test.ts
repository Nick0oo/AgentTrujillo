import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "agent/skills/tool-policy");
const skill = () => readFileSync(resolve(root, "SKILL.md"), "utf8");
const matrix = () => readFileSync(resolve(root, "references/effect-matrix.md"), "utf8");
const catalogTools = [
  "register_anthropometry",
  "evaluate_vaccination_schedule",
  "suggest_pediatric_nutrition",
  "validate_declared_pediatric_dose",
  "capture_clinical_memory_candidate",
  "evaluate_red_flags",
  "get_growth_summary",
  "record_vaccine_administration",
  "create_medication_plan",
  "record_medication_intake",
  "record_development_observation",
  "search_child_clinical_memory",
  "prepare_private_document_upload",
  "generate_vaccination_card",
];

describe("tool policy runtime skill", () => {
  it("defines the four effects and the ordered execution procedure", () => {
    const text = skill();
    for (const effect of ["read", "propose", "write", "workflow"]) expect(text).toContain(effect);
    expect(text).toMatch(/choose the narrow(?:est)? catalog tool[\s\S]*validate[\s\S]*confirmation[\s\S]*invocation/i);
    expect(text).toMatch(/authorization[\s\S]*recheck|recheck[\s\S]*authorization/i);
    expect(text).toMatch(/stale approval|cancellation|replay|idempot/i);
  });

  it("maps every approved catalog tool with explicit policy columns", () => {
    const text = matrix();
    for (const tool of catalogTools) expect(text).toContain(`| \`${tool}\` |`);
    expect(text).toMatch(/tool slug.*domain service.*effect.*confirmation.*idempotency source.*required permission.*safe result class.*owning roadmap leaf/i);
    expect(text).not.toMatch(/sql|generic table|arbitrary network|global vector/i);
    expect(text).not.toMatch(/TBD|TODO|placeholder/i);
  });

  it("keeps authority out of model inputs and approval separate from authorization", () => {
    const text = `${skill()}\n${matrix()}`;
    expect(text).toMatch(/model input schemas?\s+exclude[\s\S]*(child_id|care_space_id|guardian_id)/i);
    expect(text).toMatch(/approval is.*not.*authorization|approval.*consent.*not.*access/i);
    expect(text).toMatch(/never diagnose|never prescribe|never calculate/i);
    expect(text).toMatch(/ambiguous.*never.*repeat|never.*repeat.*ambiguous/i);
  });
});
