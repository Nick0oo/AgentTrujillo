import { randomUUID } from "node:crypto";

import { base64url, decodeProtectedHeader, jwtVerify, SignJWT } from "jose";

import type { RuntimeConfig } from "../config/env";
import type { AuthenticatedGuardian } from "./authenticated-guardian";
import { createAccessDenied, type AccessDenied } from "./access-denied";
import type { AuthorizedChildScope } from "./authorized-child-scope";
import {
  CHILD_CONTEXT_AUDIENCE,
  CHILD_CONTEXT_CLOCK_SKEW_SECONDS,
  CHILD_CONTEXT_ISSUER,
  CHILD_CONTEXT_TTL_SECONDS,
  CHILD_CONTEXT_TYPE,
  childContextClaimsSchema,
  type SignedChildContext,
  type VerifiedChildContextClaims,
} from "./child-context-claims";

export interface ChildContextTokenService {
  issue(scope: AuthorizedChildScope, guardian: AuthenticatedGuardian, now?: Date): Promise<SignedChildContext>;
  verify(token: string, guardian: AuthenticatedGuardian, now?: Date): Promise<VerifiedChildContextClaims | AccessDenied>;
}

export class ChildContextTokenError extends Error {
  readonly code = "CHILD_CONTEXT_INVALID" as const;

  constructor() {
    super("CHILD_CONTEXT_INVALID");
    this.name = "ChildContextTokenError";
  }
}

type KeyConfig = Readonly<{
  childContextSigningKey?: string;
  childContextSigningKid?: string;
  childContextPreviousSigningKey?: string;
  childContextPreviousSigningKid?: string;
}>;

function keyBytes(value: string | undefined): Uint8Array {
  if (!value) throw new ChildContextTokenError();
  const bytes = base64url.decode(value);
  if (bytes.byteLength < 32) throw new ChildContextTokenError();
  return bytes;
}

function keyMap(config: KeyConfig): Map<string, Uint8Array> {
  if (!config.childContextSigningKey || !config.childContextSigningKid) throw new ChildContextTokenError();
  const entries: [string, Uint8Array][] = [[config.childContextSigningKid, keyBytes(config.childContextSigningKey)]];
  if (config.childContextPreviousSigningKey || config.childContextPreviousSigningKid) {
    if (!config.childContextPreviousSigningKey || !config.childContextPreviousSigningKid || config.childContextPreviousSigningKid === config.childContextSigningKid) {
      throw new ChildContextTokenError();
    }
    entries.push([config.childContextPreviousSigningKid, keyBytes(config.childContextPreviousSigningKey)]);
  }
  return new Map(entries);
}

function denial(): AccessDenied {
  return createAccessDenied("child-context");
}

export function createChildContextTokenService(config: Pick<RuntimeConfig, keyof KeyConfig>): ChildContextTokenService {
  const keys = keyMap(config);
  const currentKid = config.childContextSigningKid!;
  const currentKey = keys.get(currentKid)!;

  return {
    async issue(scope, guardian, now = new Date()) {
      if (scope.actorUserId !== guardian.userId || now >= scope.expiresAt || now >= guardian.expiresAt) throw new ChildContextTokenError();
      const expMs = Math.min(
        now.getTime() + CHILD_CONTEXT_TTL_SECONDS * 1000,
        scope.expiresAt.getTime(),
        guardian.expiresAt.getTime(),
      );
      const iat = Math.floor(now.getTime() / 1000);
      const exp = Math.floor(expMs / 1000);
      if (!Number.isFinite(exp) || exp <= iat) throw new ChildContextTokenError();
      const token = await new SignJWT({
        ctx_v: 1,
        care_space_id: scope.careSpaceId,
        child_id: scope.childId,
        permissions: [...scope.permissions],
        country_of_care: scope.countryOfCare,
        timezone: scope.timezone,
        authorization_version: scope.authorizationVersion,
      })
        .setProtectedHeader({ alg: "HS256", typ: CHILD_CONTEXT_TYPE, kid: currentKid })
        .setIssuer(CHILD_CONTEXT_ISSUER)
        .setAudience(CHILD_CONTEXT_AUDIENCE)
        .setSubject(scope.actorUserId)
        .setJti(randomUUID())
        .setIssuedAt(iat)
        .setNotBefore(iat)
        .setExpirationTime(exp)
        .sign(currentKey);
      return token as SignedChildContext;
    },
    async verify(token, guardian, now = new Date()) {
      try {
        if (!token || token.length > 4096) return denial();
        const header = decodeProtectedHeader(token);
        if (header.alg !== "HS256" || header.typ !== CHILD_CONTEXT_TYPE || typeof header.kid !== "string") return denial();
        const key = keys.get(header.kid);
        if (!key) return denial();
        const verified = await jwtVerify(token, key, {
          algorithms: ["HS256"],
          issuer: CHILD_CONTEXT_ISSUER,
          audience: CHILD_CONTEXT_AUDIENCE,
          requiredClaims: ["iss", "aud", "sub", "jti", "iat", "nbf", "exp"],
          clockTolerance: CHILD_CONTEXT_CLOCK_SKEW_SECONDS,
          currentDate: now,
        });
        const parsed = childContextClaimsSchema.safeParse(verified.payload);
        if (!parsed.success || parsed.data.sub !== guardian.userId || parsed.data.exp * 1000 > guardian.expiresAt.getTime() + CHILD_CONTEXT_CLOCK_SKEW_SECONDS * 1000) return denial();
        return Object.freeze({
          actorUserId: parsed.data.sub as VerifiedChildContextClaims["actorUserId"],
          careSpaceId: parsed.data.care_space_id as VerifiedChildContextClaims["careSpaceId"],
          childId: parsed.data.child_id as VerifiedChildContextClaims["childId"],
          permissions: Object.freeze([...new Set(parsed.data.permissions)].sort()),
          countryOfCare: parsed.data.country_of_care,
          timezone: parsed.data.timezone,
          authorizationVersion: parsed.data.authorization_version,
          tokenId: parsed.data.jti,
          issuedAt: new Date(parsed.data.iat * 1000),
          expiresAt: new Date(parsed.data.exp * 1000),
        });
      } catch {
        return denial();
      }
    },
  };
}
