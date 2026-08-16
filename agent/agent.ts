import { defineAgent } from "eve";

import { loadRuntimeConfig } from "./lib/config/env";
import { createPrimaryGoogleModel } from "./lib/model/google";
import { AGENT_RUNTIME_POLICY } from "./lib/runtime/policy";

const runtimeConfig = loadRuntimeConfig(process.env);

export default defineAgent({
  model: createPrimaryGoogleModel(runtimeConfig),
  ...AGENT_RUNTIME_POLICY,
});
