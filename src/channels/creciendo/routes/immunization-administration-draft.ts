import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import type { AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope.ts";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import type { RuntimeConfig } from "../../../../agent/lib/config/env.ts";
import type { AuthenticatedChannelRequest } from "../auth-middleware.ts";
import {
  IMMUNIZATION_ADMINISTRATION_DRAFT_RESPONSE_SCHEMA,
  parseAdministrationDraftRequest,
  type ImmunizationAdministrationDraftRequest,
  type ImmunizationAdministrationDraftResponse,
} from "../immunization-administration-draft-contract.ts";
import { isValidImmunizationIdempotencyKey, publicImmunizationError } from "../immunization-contract.ts";

export type ImmunizationAdministrationDraftCommandResult = Readonly<
  | { response: ImmunizationAdministrationDraftResponse }
  | { code: "IDEMPOTENCY_CONFLICT" | "PERSISTENCE_UNAVAILABLE" }
>;

export interface ImmunizationAdministrationDraftCommand {
  execute(input: Readonly<{
    scope: AuthorizedChildScope;
    declaration: ImmunizationAdministrationDraftRequest;
    idempotencyKey: string;
    requestId: string;
    signal: AbortSignal;
  }>): Promise<ImmunizationAdministrationDraftCommandResult>;
}

export type ImmunizationAdministrationDraftRouteDependencies = Readonly<{
  tokens: ChildContextTokenService;
  authorizeChild: AuthorizeChildService;
  command: ImmunizationAdministrationDraftCommand;
  now?: () => Date;
}>;

function error(status: 400 | 403 | 409 | 503, code: "REQUEST_INVALID" | "ACCESS_DENIED" | "IDEMPOTENCY_CONFLICT" | "PERSISTENCE_UNAVAILABLE", requestId: string): Response {
  return publicImmunizationError(status, code, requestId);
}

async function readJson(request: Request): Promise<unknown | null> {
  try { return await request.json(); } catch { return null; }
}

async function resolveScope(request: Request, auth: AuthenticatedChannelRequest, dependencies: ImmunizationAdministrationDraftRouteDependencies, now: Date): Promise<AuthorizedChildScope | null> {
  const token = request.headers.get("x-child-context");
  if (!token || token.length > 4096) return null;
  try {
    const claims = await dependencies.tokens.verify(token, auth.guardian, now);
    if (!("childId" in claims)) return null;
    const scope = await dependencies.authorizeChild.authorize({
      guardian: auth.guardian,
      requestedChildId: claims.childId,
      requiredPermissions: ["record"],
      requestId: auth.requestId,
      now,
    });
    if (!("childId" in scope)
      || scope.actorUserId !== auth.guardian.userId
      || scope.careSpaceId !== claims.careSpaceId
      || scope.childId !== claims.childId
      || scope.authorizationVersion !== claims.authorizationVersion
      || !scope.permissions.includes("record")) return null;
    return scope;
  } catch { return null; }
}

export async function handleImmunizationAdministrationDraft(request: Request, auth: AuthenticatedChannelRequest, dependencies: ImmunizationAdministrationDraftRouteDependencies): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!isValidImmunizationIdempotencyKey(idempotencyKey)) return error(400, "REQUEST_INVALID", auth.requestId);
  const raw = await readJson(request);
  if (raw === null) return error(400, "REQUEST_INVALID", auth.requestId);
  const declaration = parseAdministrationDraftRequest(raw);
  if (!declaration) return error(400, "REQUEST_INVALID", auth.requestId);
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  const scope = await resolveScope(request, auth, dependencies, now);
  if (!scope) return error(403, "ACCESS_DENIED", auth.requestId);
  let result: ImmunizationAdministrationDraftCommandResult;
  try {
    result = await dependencies.command.execute({ scope, declaration, idempotencyKey, requestId: auth.requestId, signal: request.signal });
  } catch { return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId); }
  if (!("response" in result)) return error(result.code === "IDEMPOTENCY_CONFLICT" ? 409 : 503, result.code, auth.requestId);
  const parsed = IMMUNIZATION_ADMINISTRATION_DRAFT_RESPONSE_SCHEMA.safeParse(result.response);
  if (!parsed.success || parsed.data.requestId !== auth.requestId) return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  return Response.json(parsed.data, {
    status: parsed.data.outcome === "created" ? 201 : 200,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export function createUnavailableImmunizationAdministrationDraftCommand(): ImmunizationAdministrationDraftCommand {
  return Object.freeze({ async execute(): Promise<ImmunizationAdministrationDraftCommandResult> { return { code: "PERSISTENCE_UNAVAILABLE" }; } });
}

export function createImmunizationAdministrationDraftRouteDependencies(config: RuntimeConfig, command: ImmunizationAdministrationDraftCommand = createUnavailableImmunizationAdministrationDraftCommand()): ImmunizationAdministrationDraftRouteDependencies {
  return Object.freeze({ tokens: createChildContextTokenService(config), authorizeChild: createAuthorizeChildService(config), command });
}

