import { defineEval } from "eve/evals";

import { RUNTIME_FIXTURES } from "./fixtures";

export default defineEval({
  description: "Identity and automated pediatric guidance role.",
  tags: ["runtime", "smoke", "identity"],
  async test(t) {
    await t.send(RUNTIME_FIXTURES.identity);
    t.succeeded();
    t.messageIncludes(/pediatric|pediatr|orient|guidance|orientación/i);
    t.usedNoTools();
    t.noFailedActions();
  },
});
