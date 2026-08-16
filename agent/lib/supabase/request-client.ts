import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RuntimeConfig } from "../config/env";
import type { Database } from "./database.types";
import type { SupabaseBearerToken } from "./types";

export type RequestSupabaseClient = SupabaseClient<Database>;

export class RequestSupabaseClientError extends Error {
  readonly code = "SUPABASE_REQUEST_CLIENT_INVALID" as const;

  constructor() {
    super("SUPABASE_REQUEST_CLIENT_INVALID");
    this.name = "RequestSupabaseClientError";
  }
}

export function createRequestSupabaseClient(input: Readonly<{
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">;
  accessToken: SupabaseBearerToken;
  fetch?: typeof globalThis.fetch;
}>): RequestSupabaseClient {
  if (!input.accessToken || input.accessToken.trim().length === 0) {
    throw new RequestSupabaseClientError();
  }

  return createClient<Database>(
    input.config.supabaseUrl,
    input.config.supabasePublishableKey,
    {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${input.accessToken}` },
        ...(input.fetch ? { fetch: input.fetch } : {}),
      },
    },
  );
}
