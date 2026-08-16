import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RuntimeConfig } from "../config/env";
import type { Database } from "./database.types";
import {
  PRIVILEGED_OPERATIONS,
  type PrivilegedJobScope,
  type PrivilegedOperation,
} from "./privileged-job-scope";

export type PrivilegedSupabaseClient = SupabaseClient<Database>;

export class PrivilegedJobError extends Error {
  readonly code = "PRIVILEGED_JOB_DENIED" as const;

  constructor() {
    super("PRIVILEGED_JOB_DENIED");
    this.name = "PrivilegedJobError";
  }
}

function validUuid(value: string | undefined): boolean {
  return value === undefined || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assertScope(scope: PrivilegedJobScope, operation: PrivilegedOperation, now: Date): void {
  const issuedAt = scope.issuedAt?.getTime();
  const expiresAt = scope.expiresAt?.getTime();
  const nowMs = now.getTime();
  const ttl = expiresAt - issuedAt;
  const allowed = new Set(PRIVILEGED_OPERATIONS);

  if (!scope.jobName || !scope.invocationId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
    || !Number.isFinite(nowMs) || nowMs < issuedAt || nowMs >= expiresAt || ttl <= 0 || ttl > 15 * 60 * 1000
    || !validUuid(scope.careSpaceId) || !validUuid(scope.childId)
    || (scope.childId !== undefined && scope.careSpaceId === undefined)
    || !allowed.has(operation)
    || !scope.allowedOperations.includes(operation)
    || scope.allowedOperations.some((candidate) => !allowed.has(candidate))) {
    throw new PrivilegedJobError();
  }
}

export async function withPrivilegedJobClient<T>(
  input: Readonly<{
    config: RuntimeConfig;
    scope: PrivilegedJobScope;
    operation: PrivilegedOperation;
    now?: Date;
    fetch?: typeof globalThis.fetch;
  }>,
  run: (client: PrivilegedSupabaseClient, scope: PrivilegedJobScope) => Promise<T>,
): Promise<T> {
  const now = input.now ?? new Date();
  assertScope(input.scope, input.operation, now);
  const serviceRoleKey = input.config.supabaseServiceRoleKey;
  if (!serviceRoleKey) throw new PrivilegedJobError();

  const client = createClient<Database>(input.config.supabaseUrl, serviceRoleKey, {
    db: { schema: "public" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${serviceRoleKey}` },
      ...(input.fetch ? { fetch: input.fetch } : {}),
    },
  });

  const result = await run(client, input.scope);
  assertScope(input.scope, input.operation, input.now ?? new Date());
  if (result === client || result === serviceRoleKey || result === input.config) {
    throw new PrivilegedJobError();
  }
  return result;
}
