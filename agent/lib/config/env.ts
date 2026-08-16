import { z } from "zod";

export const runtimeConfigFieldSchema = z.enum([
  "APP_ENV",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
]);

export type RuntimeConfigField = z.infer<typeof runtimeConfigFieldSchema>;

const appEnvSchema = z.enum(["development", "test", "preview", "production"]);
const runtimeInputSchema = z.object({
  APP_ENV: appEnvSchema,
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(20)
    .regex(/^\S+$/),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20)
    .regex(/^\S+$/),
}).superRefine((input, context) => {
  const url = new URL(input.SUPABASE_URL);
  const localHost = new Set(["localhost", "127.0.0.1", "::1"]);
  const localUrl = localHost.has(url.hostname);

  if (input.APP_ENV === "production" || input.APP_ENV === "preview") {
    if (url.protocol !== "https:") {
      context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "HTTPS_REQUIRED" });
    }
  } else if (url.protocol !== "https:" && !(url.protocol === "http:" && localUrl)) {
    context.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "LOCAL_LOOPBACK_REQUIRED" });
  }
});

export type RuntimeConfig = Readonly<{
  appEnv: z.infer<typeof appEnvSchema>;
  googleApiKey: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}>;

export class RuntimeConfigError extends Error {
  readonly code = "ENV_INVALID" as const;
  readonly invalidFields: readonly RuntimeConfigField[];

  constructor(invalidFields: readonly RuntimeConfigField[]) {
    super("ENV_INVALID");
    this.name = "RuntimeConfigError";
    this.invalidFields = Object.freeze([...invalidFields]);
  }
}

function normalizeAppEnv(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function invalidFieldsFrom(error: z.ZodError): RuntimeConfigField[] {
  return [
    ...new Set(
      error.issues
        .map((issue) => issue.path[0])
        .filter((field): field is RuntimeConfigField =>
          runtimeConfigFieldSchema.safeParse(field).success,
        ),
    ),
  ].sort();
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = runtimeInputSchema.safeParse({
    APP_ENV: normalizeAppEnv(env.APP_ENV),
    GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(invalidFieldsFrom(parsed.error));
  }

  return Object.freeze({
    appEnv: parsed.data.APP_ENV,
    googleApiKey: parsed.data.GOOGLE_GENERATIVE_AI_API_KEY,
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
  });
}
