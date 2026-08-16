import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

import type { RuntimeConfig } from "../config/env";

export const PRIMARY_GOOGLE_MODEL_ID = "gemini-3.6-flash" as const;
export type PrimaryGoogleModelId = typeof PRIMARY_GOOGLE_MODEL_ID;

export function createPrimaryGoogleModel(config: RuntimeConfig): LanguageModel {
  const provider = createGoogle({ apiKey: config.googleApiKey });

  return provider(PRIMARY_GOOGLE_MODEL_ID);
}
