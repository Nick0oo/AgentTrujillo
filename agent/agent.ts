import { defineAgent } from "eve";

import { loadRuntimeConfig } from "./lib/config/env";
import { createPrimaryGoogleModel } from "./lib/model/google";

const runtimeConfig = loadRuntimeConfig(process.env);

export default defineAgent({
  model: createPrimaryGoogleModel(runtimeConfig),
});
