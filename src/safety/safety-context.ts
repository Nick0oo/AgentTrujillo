import { createHash } from "node:crypto";

import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";

import {
  deepFreeze,
  isSafetyLocale,
  SafetyInputError,
  type SafetyLocale,
  type TrustedSafetyContext,
} from "./message-types";

const MAX_AGE_DAYS = 18 * 366;

export type TrustedSafetyContextInput = Readonly<{
  chronologicalAgeDays: number;
  correctedAgeDays?: number | null;
  locale: SafetyLocale;
  timezone: string;
  referenceInstant: Date;
}>;

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function fingerprintScope(scope: AuthorizedChildScope): string {
  return createHash("sha256")
    .update([scope.actorUserId, scope.careSpaceId, scope.childId, scope.authorizationVersion].join("|"), "utf8")
    .digest("hex");
}

function validateFacts(input: TrustedSafetyContextInput): void {
  if (!Number.isInteger(input.chronologicalAgeDays) || input.chronologicalAgeDays < 0 || input.chronologicalAgeDays > MAX_AGE_DAYS) {
    throw new SafetyInputError("INVALID_CONTEXT");
  }
  if (input.correctedAgeDays !== undefined && input.correctedAgeDays !== null
    && (!Number.isInteger(input.correctedAgeDays) || input.correctedAgeDays < 0 || input.correctedAgeDays > MAX_AGE_DAYS)) {
    throw new SafetyInputError("INVALID_CONTEXT");
  }
  if (!isSafetyLocale(input.locale) || !validTimezone(input.timezone) || !(input.referenceInstant instanceof Date)
    || !Number.isFinite(input.referenceInstant.getTime())) {
    throw new SafetyInputError("INVALID_CONTEXT");
  }
}

export function createTrustedSafetyContextFromAuthorizedScope(
  scope: AuthorizedChildScope,
  input: TrustedSafetyContextInput,
): TrustedSafetyContext {
  validateFacts(input);
  if (input.referenceInstant < scope.issuedAt || input.referenceInstant >= scope.expiresAt) {
    throw new SafetyInputError("STALE_CONTEXT");
  }
  return deepFreeze({
    scopeFingerprint: fingerprintScope(scope),
    authorizationVersion: scope.authorizationVersion,
    chronologicalAgeDays: input.chronologicalAgeDays,
    correctedAgeDays: input.correctedAgeDays ?? null,
    countryOfCare: scope.countryOfCare,
    locale: input.locale,
    timezone: input.timezone,
    referenceInstant: new Date(input.referenceInstant.getTime()),
  });
}
