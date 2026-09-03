import { defineAgent } from "eve";

import { loadRuntimeConfig } from "./lib/config/env";
import { createPrimaryGoogleModel } from "./lib/model/google";
import { AGENT_RUNTIME_POLICY } from "./lib/runtime/policy";
import { ensureProductionToolContextFactoryInstalled } from "./lib/runtime/production-tool-context";

ensureProductionToolContextFactoryInstalled();

const runtimeConfig = loadRuntimeConfig(process.env);

export default defineAgent({
  model: createPrimaryGoogleModel(runtimeConfig),
  modelContextWindowTokens: 200_000,
  ...AGENT_RUNTIME_POLICY,
});

