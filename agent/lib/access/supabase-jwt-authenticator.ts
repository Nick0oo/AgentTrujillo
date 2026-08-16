import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { RuntimeConfig } from "../config/env";
import {
  AuthenticationError,
  type AuthenticatedGuardian,
} from "./authenticated-guardian";
import type { SupabaseBearerToken } from "../supabase/types";

type JwtKeySet = Parameters<typeof jwtVerify>[1];

type SupabaseClaims = JWTPayload & {
  role: string;
  sub: string;
  session_id?: string;
  auth_session_id?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_HEADER_BYTES = 4096;
const CLOCK_SKEW_SECONDS = 5;
const DEFAULT_MAX_TOKEN_AGE_SECONDS = 60 * 60;

export interface SupabaseJwtAuthenticator {
  authenticateAuthorizationHeader(header: string | null, requestId: string, now?: Date): Promise<AuthenticatedGuardian>;
}

export class SupabaseJwtAuthenticatorError extends AuthenticationError {}

function parseBearer(header: string | null): string {
  if (!header || header.length > MAX_HEADER_BYTES || /[\u0000-\u001f\u007f]/.test(header)) {
    throw new Error("invalid authorization header");
  }
  const match = /^Bearer ([^\s]+)$/.exec(header);
  if (!match || match[1].split(".").length !== 3) {
    throw new Error("invalid authorization header");
  }
  return match[1];
}

class SupabaseJwtAuthenticatorImpl implements SupabaseJwtAuthenticator {
  private readonly keySet: JwtKeySet;
  private readonly maxTokenAgeSeconds: number;

  constructor(
    private readonly config: Pick<RuntimeConfig, "supabaseJwtIssuer" | "supabaseJwtAudience" | "supabaseJwtJwksUrl">,
    options: Readonly<{ keySet?: JwtKeySet; maxTokenAgeSeconds?: number }> = {},
  ) {
    const jwksUrl = new URL(config.supabaseJwtJwksUrl);
    const issuerUrl = new URL(config.supabaseJwtIssuer);
    if (jwksUrl.origin !== issuerUrl.origin || !jwksUrl.pathname.endsWith("/.well-known/jwks.json")) {
      throw new Error("invalid Supabase JWKS origin");
    }
    this.keySet = options.keySet ?? createRemoteJWKSet(jwksUrl);
    this.maxTokenAgeSeconds = options.maxTokenAgeSeconds ?? DEFAULT_MAX_TOKEN_AGE_SECONDS;
  }

  async authenticateAuthorizationHeader(header: string | null, requestId: string, now = new Date()): Promise<AuthenticatedGuardian> {
    try {
      const token = parseBearer(header);
      const verified = await jwtVerify<SupabaseClaims>(token, this.keySet, {
        issuer: this.config.supabaseJwtIssuer,
        audience: this.config.supabaseJwtAudience,
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["iss", "aud", "sub", "role", "exp", "iat"],
        clockTolerance: CLOCK_SKEW_SECONDS,
        currentDate: now,
        maxTokenAge: `${this.maxTokenAgeSeconds}s`,
      });
      const claims = verified.payload;
      const issuedAtSeconds = claims.iat;
      const expiresAtSeconds = claims.exp;
      if (claims.role !== "authenticated"
        || !claims.sub || !UUID_PATTERN.test(claims.sub)
        || issuedAtSeconds === undefined || expiresAtSeconds === undefined
        || issuedAtSeconds > now.getTime() / 1000 + CLOCK_SKEW_SECONDS
        || expiresAtSeconds <= issuedAtSeconds) {
        throw new Error("invalid Supabase claims");
      }

      const authSessionId = claims.auth_session_id ?? claims.session_id;
      return Object.freeze({
        userId: claims.sub,
        issuedAt: new Date(issuedAtSeconds * 1000),
        expiresAt: new Date(expiresAtSeconds * 1000),
        ...(authSessionId ? { authSessionId } : {}),
        bearerToken: token as SupabaseBearerToken,
      });
    } catch {
      throw new SupabaseJwtAuthenticatorError(requestId);
    }
  }
}

export function createSupabaseJwtAuthenticator(
  config: Pick<RuntimeConfig, "supabaseJwtIssuer" | "supabaseJwtAudience" | "supabaseJwtJwksUrl">,
  options?: Readonly<{ keySet?: JwtKeySet; maxTokenAgeSeconds?: number }>,
): SupabaseJwtAuthenticator {
  return new SupabaseJwtAuthenticatorImpl(config, options);
}
