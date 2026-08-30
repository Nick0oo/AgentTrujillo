import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";

export default defineConfig({
  root: "src/workflows",
  plugins: [workflow({ cwd: ".", outDir: "../../.workflow-vitest-at12", dataDir: "../../.workflow-data-at12" })],
  test: {
    include: ["../../tests/workflows/**/*.integration.ts"],
    testTimeout: 60_000,
  },
});
