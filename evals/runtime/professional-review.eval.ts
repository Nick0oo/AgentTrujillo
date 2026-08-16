import { defineEval } from "eve/evals";

import { RUNTIME_FIXTURES } from "./fixtures";

export default defineEval({
  description: "Professional review recommends a pediatrician without clinician operations.",
  tags: ["runtime", "smoke", "professional-review"],
  async test(t) {
    await t.send(RUNTIME_FIXTURES.professionalReview);
    t.succeeded();
    t.loadedSkill("clinical-safety");
    t.loadedSkill("response-format");
    t.messageIncludes(/pediatrician|pediatra/i);
    t.notCalledTool("bash");
    t.notCalledTool("web_search");
    t.notCalledTool("agent");
    t.notCalledTool("workflow");
    t.noFailedActions();
  },
});
