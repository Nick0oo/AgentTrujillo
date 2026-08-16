import type { SupabaseBearerToken } from "../supabase/types";

export type AuthenticatedGuardian = Readonly<{
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
  authSessionId?: string;
  bearerToken: SupabaseBearerToken;
}>;

export type AuthenticationFailure = Readonly<{
  ok: false;
  code: "AUTHENTICATION_FAILED";
  requestId: string;
}>;

export class AuthenticationError extends Error {
  readonly failure: AuthenticationFailure;

  constructor(requestId: string) {
    super("AUTHENTICATION_FAILED");
    this.name = "AuthenticationError";
    this.failure = Object.freeze({ ok: false, code: "AUTHENTICATION_FAILED", requestId });
  }
}
