import { z } from "zod";

export const runtimeConfigFieldSchema = z.enum([
  "APP_ENV",
  "GOOGLE_GENERATIVE_AI_API_KEY",
]);

export type RuntimeConfigField = z.infer<typeof runtimeConfigFieldSchema>;

const appEnvSchema = z.enum(["development", "test", "preview", "production"]);
const runtimeInputSchema = z.object({
  APP_ENV: appEnvSchema,
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(20)
    .regex(/^\S+$/),
});

export type RuntimeConfig = Readonly<{
  appEnv: z.infer<typeof appEnvSchema>;
  googleApiKey: string;
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
  });

  if (!parsed.success) {
    throw new RuntimeConfigError(invalidFieldsFrom(parsed.error));
  }

  return Object.freeze({
    appEnv: parsed.data.APP_ENV,
    googleApiKey: parsed.data.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}
