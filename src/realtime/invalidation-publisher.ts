import { z } from "zod";

import {
  isAuthorizedChildScopeActive,
  type AuthorizedChildScope,
} from "../../agent/lib/access/authorized-child-scope.ts";

export const INVALIDATION_RESOURCES = Object.freeze({
  child: Object.freeze({ refetch: "child-directory" }),
  dashboard: Object.freeze({ refetch: "dashboard" }),
  growth: Object.freeze({ refetch: "growth" }),
  immunization: Object.freeze({ refetch: "immunization" }),
  medication: Object.freeze({ refetch: "medication" }),
  development: Object.freeze({ refetch: "development" }),
  document: Object.freeze({ refetch: "documents" }),
  conversation: Object.freeze({ refetch: "conversation" }),
  nutrition: Object.freeze({ refetch: "nutrition" }),
  settings: Object.freeze({ refetch: "child-settings" }),
} as const);

export type InvalidationResourceKind = keyof typeof INVALIDATION_RESOURCES;

const UUID = z.string().uuid();
const VERSION = z.number().int().positive().safe();
const requestSchema = z.object({
  resourceKind: z.enum(Object.keys(INVALIDATION_RESOURCES) as [InvalidationResourceKind, ...InvalidationResourceKind[]]),
  resourceId: UUID,
  version: VERSION,
  sourceEventId: UUID,
  sessionId: UUID.optional(),
}).strict();

export type InvalidationRequest = Readonly<z.infer<typeof requestSchema>>;

export type InvalidationAppendReceipt = Readonly<{
  outcome: "created" | "idempotent_replay";
  invalidationId: number;
  sequence: number;
}>;

export type InvalidationTransaction = Readonly<{
  appendRealtimeInvalidation(input: Readonly<{
    careSpaceId: string;
    childId: string;
    sessionId: string | null;
    resourceKind: InvalidationResourceKind;
    resourceId: string;
    resourceVersion: number;
    sourceEventId: string;
  }>): Promise<Readonly<{
    outcome: "created" | "idempotent_replay" | "conflict" | "version_conflict";
    invalidationId: number | null;
    invalidationSequence: number | null;
  }>>;
}>;

export class InvalidationPublisherError extends Error {
  readonly code: "INVALIDATION_SCOPE_INACTIVE" | "INVALIDATION_INPUT_INVALID" | "INVALIDATION_CONFLICT" | "INVALIDATION_APPEND_FAILED";
  readonly retryable: boolean;

  constructor(
    code: InvalidationPublisherError["code"],
    retryable: boolean,
  ) {
    super(code);
    this.name = "InvalidationPublisherError";
    this.code = code;
    this.retryable = retryable;
  }
}

type AppendResult = Awaited<ReturnType<InvalidationTransaction["appendRealtimeInvalidation"]>>;

function receipt(value: AppendResult): InvalidationAppendReceipt {
  if (value.outcome !== "created" && value.outcome !== "idempotent_replay") {
    throw new InvalidationPublisherError("INVALIDATION_APPEND_FAILED", true);
  }
  if (
    value.invalidationId === null
    || !Number.isSafeInteger(value.invalidationId)
    || value.invalidationSequence === null
    || !Number.isSafeInteger(value.invalidationSequence)
    || value.invalidationId <= 0
    || value.invalidationSequence <= 0
  ) {
    throw new InvalidationPublisherError("INVALIDATION_APPEND_FAILED", true);
  }
  return Object.freeze({
    outcome: value.outcome,
    invalidationId: value.invalidationId,
    sequence: value.invalidationSequence,
  });
}

export async function publishInvalidation(
  transaction: InvalidationTransaction,
  scope: AuthorizedChildScope,
  input: InvalidationRequest,
): Promise<InvalidationAppendReceipt> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new InvalidationPublisherError("INVALIDATION_INPUT_INVALID", false);
  if (!isAuthorizedChildScopeActive(scope)) {
    throw new InvalidationPublisherError("INVALIDATION_SCOPE_INACTIVE", false);
  }

  try {
    const result = await transaction.appendRealtimeInvalidation({
      careSpaceId: scope.careSpaceId,
      childId: scope.childId,
      sessionId: parsed.data.sessionId ?? null,
      resourceKind: parsed.data.resourceKind,
      resourceId: parsed.data.resourceId,
      resourceVersion: parsed.data.version,
      sourceEventId: parsed.data.sourceEventId,
    });

    if (result.outcome === "conflict" || result.outcome === "version_conflict") {
      throw new InvalidationPublisherError("INVALIDATION_CONFLICT", false);
    }
    if (result.outcome !== "created" && result.outcome !== "idempotent_replay") {
      throw new InvalidationPublisherError("INVALIDATION_APPEND_FAILED", true);
    }
    return receipt(result);
  } catch (error) {
    if (error instanceof InvalidationPublisherError) throw error;
    throw new InvalidationPublisherError("INVALIDATION_APPEND_FAILED", true);
  }
}
