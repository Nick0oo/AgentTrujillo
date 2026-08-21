import { defineEval } from "eve/evals";

import { RUNTIME_FIXTURES } from "./fixtures";

export default defineEval({
  description: "Formats a trusted emergency mode as a terminal policy copy.",
  tags: ["runtime", "smoke", "emergency-boundary"],
  async test(t) {
    await t.send(RUNTIME_FIXTURES.emergencyBoundary);
    t.succeeded();
    t.loadedSkill("response-format");
    t.messageIncludes(/emergency department|urgencias|emergencias/i);
    t.messageIncludes(/direct|inmediat|sin demora|straight/i);
    t.notCalledTool("bash");
    t.notCalledTool("web_search");
    t.notCalledTool("agent");
    t.notCalledTool("workflow");
    t.noFailedActions();
  },
});
