import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import type { AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope.ts";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import type { RuntimeConfig } from "../../../../agent/lib/config/env.ts";
import type { AuthenticatedChannelRequest } from "../auth-middleware.ts";
import {
  IMMUNIZATION_ADMINISTRATION_RESPONSE_SCHEMA,
  isValidImmunizationIdempotencyKey,
  parseAdministrationRequest,
  publicImmunizationError,
  type ImmunizationAdministrationRequest,
  type ImmunizationAdministrationResponse,
} from "../immunization-contract.ts";

export type ImmunizationAdministrationCommandErrorCode =
  | "IDEMPOTENCY_CONFLICT"
  | "CONFIRMATION_INVALID"
  | "NOT_FOUND"
  | "PERSISTENCE_UNAVAILABLE";

export type ImmunizationAdministrationCommandResult = Readonly<
  | { response: ImmunizationAdministrationResponse }
  | { code: ImmunizationAdministrationCommandErrorCode }
>;

export interface ImmunizationAdministrationCommand {
  execute(input: Readonly<{
    scope: AuthorizedChildScope;
    declaration: ImmunizationAdministrationRequest;
    idempotencyKey: string;
    requestId: string;
    signal: AbortSignal;
  }>): Promise<ImmunizationAdministrationCommandResult>;
}

export type ImmunizationAdministrationRouteDependencies = Readonly<{
  tokens: ChildContextTokenService;
  authorizeChild: AuthorizeChildService;
  command: ImmunizationAdministrationCommand;
  now?: () => Date;
}>;

function error(
  status: 400 | 403 | 404 | 409 | 422 | 503,
  code: "REQUEST_INVALID" | "ACCESS_DENIED" | "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "CONFIRMATION_INVALID" | "PERSISTENCE_UNAVAILABLE",
  requestId: string,
): Response {
  return publicImmunizationError(status, code, requestId);
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function resolveScope(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: ImmunizationAdministrationRouteDependencies,
  now: Date,
): Promise<AuthorizedChildScope | null> {
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
  } catch {
    return null;
  }
}

export async function handleImmunizationAdministration(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: ImmunizationAdministrationRouteDependencies,
): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!isValidImmunizationIdempotencyKey(idempotencyKey)) return error(400, "REQUEST_INVALID", auth.requestId);
  const raw = await readJson(request);
  if (raw === null) return error(400, "REQUEST_INVALID", auth.requestId);
  if (typeof raw === "object" && raw !== null && "confirmed" in raw && raw.confirmed !== true) {
    return error(422, "CONFIRMATION_INVALID", auth.requestId);
  }
  const declaration = parseAdministrationRequest(raw);
  if (!declaration) return error(400, "REQUEST_INVALID", auth.requestId);

  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
  const scope = await resolveScope(request, auth, dependencies, now);
  if (!scope) return error(403, "ACCESS_DENIED", auth.requestId);

  let result: ImmunizationAdministrationCommandResult;
  try {
    result = await dependencies.command.execute({
      scope,
      declaration,
      idempotencyKey,
      requestId: auth.requestId,
      signal: request.signal,
    });
  } catch {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
  if (!("response" in result)) {
    if (result.code === "IDEMPOTENCY_CONFLICT") return error(409, result.code, auth.requestId);
    if (result.code === "CONFIRMATION_INVALID") return error(422, result.code, auth.requestId);
    if (result.code === "NOT_FOUND") return error(404, result.code, auth.requestId);
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }

  const parsed = IMMUNIZATION_ADMINISTRATION_RESPONSE_SCHEMA.safeParse(result.response);
  if (!parsed.success || parsed.data.requestId !== auth.requestId || parsed.data.country !== scope.countryOfCare) {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
  return Response.json(parsed.data, {
    status: parsed.data.outcome === "created" ? 201 : 200,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export function createUnavailableImmunizationAdministrationCommand(): ImmunizationAdministrationCommand {
  return Object.freeze({
    async execute(): Promise<ImmunizationAdministrationCommandResult> {
      return { code: "PERSISTENCE_UNAVAILABLE" };
    },
  });
}

export function createImmunizationAdministrationRouteDependencies(
  config: RuntimeConfig,
  command: ImmunizationAdministrationCommand = createUnavailableImmunizationAdministrationCommand(),
): ImmunizationAdministrationRouteDependencies {
  return Object.freeze({
    tokens: createChildContextTokenService(config),
    authorizeChild: createAuthorizeChildService(config),
    command,
  });
}
