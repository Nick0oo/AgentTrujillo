import { z } from "zod";

export const runtimeConfigFieldSchema = z.enum([
  "APP_ENV",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_ISSUER",
  "SUPABASE_JWT_AUDIENCE",
  "CHILD_CONTEXT_SIGNING_KEY",
  "CHILD_CONTEXT_SIGNING_KID",
  "CHILD_CONTEXT_PREVIOUS_SIGNING_KEY",
  "CHILD_CONTEXT_PREVIOUS_SIGNING_KID",
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
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20)
    .regex(/^\S+$/)
    .optional(),
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  SUPABASE_JWT_AUDIENCE: z.literal("authenticated").default("authenticated"),
  CHILD_CONTEXT_SIGNING_KEY: z.string().regex(/^[A-Za-z0-9_-]{43,}$/).optional(),
  CHILD_CONTEXT_SIGNING_KID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
  CHILD_CONTEXT_PREVIOUS_SIGNING_KEY: z.string().regex(/^[A-Za-z0-9_-]{43,}$/).optional(),
  CHILD_CONTEXT_PREVIOUS_SIGNING_KID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
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
  if ((input.CHILD_CONTEXT_SIGNING_KEY === undefined) !== (input.CHILD_CONTEXT_SIGNING_KID === undefined)) {
    context.addIssue({ code: "custom", path: ["CHILD_CONTEXT_SIGNING_KEY"], message: "CURRENT_CONTEXT_KEY_PAIR_REQUIRED" });
    context.addIssue({ code: "custom", path: ["CHILD_CONTEXT_SIGNING_KID"], message: "CURRENT_CONTEXT_KEY_PAIR_REQUIRED" });
  }
  if ((input.CHILD_CONTEXT_PREVIOUS_SIGNING_KEY === undefined) !== (input.CHILD_CONTEXT_PREVIOUS_SIGNING_KID === undefined)) {
    context.addIssue({ code: "custom", path: ["CHILD_CONTEXT_PREVIOUS_SIGNING_KEY"], message: "PREVIOUS_CONTEXT_KEY_PAIR_REQUIRED" });
    context.addIssue({ code: "custom", path: ["CHILD_CONTEXT_PREVIOUS_SIGNING_KID"], message: "PREVIOUS_CONTEXT_KEY_PAIR_REQUIRED" });
  }
  if (input.CHILD_CONTEXT_SIGNING_KID && input.CHILD_CONTEXT_SIGNING_KID === input.CHILD_CONTEXT_PREVIOUS_SIGNING_KID) {
    context.addIssue({ code: "custom", path: ["CHILD_CONTEXT_PREVIOUS_SIGNING_KID"], message: "CONTEXT_KID_MUST_DIFFER" });
  }
});

export type RuntimeConfig = Readonly<{
  appEnv: z.infer<typeof appEnvSchema>;
  googleApiKey: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey?: string;
  supabaseJwtIssuer: string;
  supabaseJwtAudience: "authenticated";
  supabaseJwtJwksUrl: string;
  childContextSigningKey?: string;
  childContextSigningKid?: string;
  childContextPreviousSigningKey?: string;
  childContextPreviousSigningKid?: string;
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
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_ISSUER: env.SUPABASE_JWT_ISSUER,
    SUPABASE_JWT_AUDIENCE: env.SUPABASE_JWT_AUDIENCE,
    CHILD_CONTEXT_SIGNING_KEY: env.CHILD_CONTEXT_SIGNING_KEY,
    CHILD_CONTEXT_SIGNING_KID: env.CHILD_CONTEXT_SIGNING_KID,
    CHILD_CONTEXT_PREVIOUS_SIGNING_KEY: env.CHILD_CONTEXT_PREVIOUS_SIGNING_KEY,
    CHILD_CONTEXT_PREVIOUS_SIGNING_KID: env.CHILD_CONTEXT_PREVIOUS_SIGNING_KID,
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(invalidFieldsFrom(parsed.error));
  }

  const derivedIssuer = `${parsed.data.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
  if (parsed.data.SUPABASE_JWT_ISSUER && parsed.data.SUPABASE_JWT_ISSUER !== derivedIssuer) {
    throw new RuntimeConfigError(["SUPABASE_JWT_ISSUER"]);
  }
  const supabaseJwtIssuer = parsed.data.SUPABASE_JWT_ISSUER ?? derivedIssuer;

  return Object.freeze({
    appEnv: parsed.data.APP_ENV,
    googleApiKey: parsed.data.GOOGLE_GENERATIVE_AI_API_KEY,
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabasePublishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
    ...(parsed.data.SUPABASE_SERVICE_ROLE_KEY
      ? { supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY }
      : {}),
    supabaseJwtIssuer,
    supabaseJwtAudience: parsed.data.SUPABASE_JWT_AUDIENCE,
    supabaseJwtJwksUrl: `${supabaseJwtIssuer}/.well-known/jwks.json`,
    ...(parsed.data.CHILD_CONTEXT_SIGNING_KEY && parsed.data.CHILD_CONTEXT_SIGNING_KID
      ? { childContextSigningKey: parsed.data.CHILD_CONTEXT_SIGNING_KEY, childContextSigningKid: parsed.data.CHILD_CONTEXT_SIGNING_KID }
      : {}),
    ...(parsed.data.CHILD_CONTEXT_PREVIOUS_SIGNING_KEY && parsed.data.CHILD_CONTEXT_PREVIOUS_SIGNING_KID
      ? { childContextPreviousSigningKey: parsed.data.CHILD_CONTEXT_PREVIOUS_SIGNING_KEY, childContextPreviousSigningKid: parsed.data.CHILD_CONTEXT_PREVIOUS_SIGNING_KID }
      : {}),
  });
}
