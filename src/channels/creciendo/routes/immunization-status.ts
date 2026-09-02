import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service.ts";
import type { AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope.ts";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token.ts";
import type { RuntimeConfig } from "../../../../agent/lib/config/env.ts";
import type { VaccinationScheduleEvaluation } from "../../../../agent/tools/evaluate_vaccination_schedule.ts";
import type { AuthenticatedChannelRequest } from "../auth-middleware.ts";
import {
  projectImmunizationStatus,
  publicImmunizationError,
  type ImmunizationStatusResponse,
} from "../immunization-contract.ts";

export interface ImmunizationStatusResolver {
  evaluate(input: Readonly<{
    scope: AuthorizedChildScope;
    childId: string;
    careSpaceId: string;
    country: "CO" | "US";
    asOfDate: string;
    locale: "es-CO" | "en-US";
    signal: AbortSignal;
  }>): Promise<VaccinationScheduleEvaluation | null>;
}

export type ImmunizationStatusRouteDependencies = Readonly<{
  tokens: ChildContextTokenService;
  authorizeChild: AuthorizeChildService;
  resolver: ImmunizationStatusResolver;
  now?: () => Date;
}>;

function error(status: 403 | 503, code: "ACCESS_DENIED" | "PERSISTENCE_UNAVAILABLE", requestId: string): Response {
  return publicImmunizationError(status, code, requestId);
}

function calendarDate(now: Date, timeZone: string): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return null;
    const date = `${year}-${month}-${day}`;
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
  } catch {
    return null;
  }
}

export async function handleImmunizationStatus(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: ImmunizationStatusRouteDependencies,
): Promise<Response> {
  if (request.signal.aborted) return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  const now = dependencies.now?.() ?? new Date();
  const asOfDate = calendarDate(now, auth.profile.timeZone);
  const token = request.headers.get("x-child-context");
  if (!asOfDate || !token || token.length > 4096) return error(403, "ACCESS_DENIED", auth.requestId);

  let claims: Awaited<ReturnType<ChildContextTokenService["verify"]>>;
  try {
    claims = await dependencies.tokens.verify(token, auth.guardian, now);
  } catch {
    return error(403, "ACCESS_DENIED", auth.requestId);
  }
  if (!("childId" in claims)) return error(403, "ACCESS_DENIED", auth.requestId);

  let scope: Awaited<ReturnType<AuthorizeChildService["authorize"]>>;
  try {
    scope = await dependencies.authorizeChild.authorize({
      guardian: auth.guardian,
      requestedChildId: claims.childId,
      requiredPermissions: ["read"],
      requestId: auth.requestId,
      now,
    });
  } catch {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
  if (!("childId" in scope)
    || scope.careSpaceId !== claims.careSpaceId
    || scope.childId !== claims.childId) {
    return error(403, "ACCESS_DENIED", auth.requestId);
  }

  let evaluation: VaccinationScheduleEvaluation | null;
  try {
    evaluation = await dependencies.resolver.evaluate({
      scope,
      childId: scope.childId,
      careSpaceId: scope.careSpaceId,
      country: scope.countryOfCare,
      asOfDate,
      locale: auth.profile.locale,
      signal: request.signal,
    });
  } catch {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
  if (request.signal.aborted) return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);

  try {
    const response: ImmunizationStatusResponse = projectImmunizationStatus({
      requestId: auth.requestId,
      scope,
      asOfDate,
      evaluation,
    });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return error(503, "PERSISTENCE_UNAVAILABLE", auth.requestId);
  }
}

export function createUnavailableImmunizationStatusResolver(): ImmunizationStatusResolver {
  return Object.freeze({
    async evaluate(): Promise<VaccinationScheduleEvaluation | null> {
      return null;
    },
  });
}

export function createImmunizationStatusRouteDependencies(
  config: RuntimeConfig,
  resolver: ImmunizationStatusResolver = createUnavailableImmunizationStatusResolver(),
): ImmunizationStatusRouteDependencies {
  return Object.freeze({
    tokens: createChildContextTokenService(config),
    authorizeChild: createAuthorizeChildService(config),
    resolver,
  });
}
