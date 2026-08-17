import { defineEvalConfig } from "eve/evals";

export const GROWTH_REPRODUCIBILITY_EVAL = Object.freeze({
  manifest: "tests/fixtures/growth/reproducibility-manifest.json",
  provider: "none",
  maxConcurrency: 1,
});

export default defineEvalConfig({
  maxConcurrency: 1,
  timeoutMs: 30_000,
});
