import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { base64url, decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import {
  CONTINUATION_TOKEN_AUDIENCE,
  CONTINUATION_TOKEN_CLAIMS_SCHEMA,
  CONTINUATION_TOKEN_ISSUER,
  CONTINUATION_TOKEN_TTL_SECONDS,
  CONTINUATION_TOKEN_VERSION,
  type ContinuationToken,
  type ContinuationTokenClaims,
} from "./types";

const TOKEN_TYPE = "creciendo-continuation+jwt";
const CLOCK_SKEW_SECONDS = 15;
const MAX_TOKEN_BYTES = 4_096;
const KID = /^[A-Za-z0-9._-]{1,64}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export type ContinuationTokenKey = Readonly<{ kid: string; secret: string }>;

export type ContinuationTokenKeyRing = Readonly<{
  currentKid: string;
  verificationKids: readonly string[];
}>;

type InternalKeyRing = Readonly<{
  currentKid: string;
  currentKey: Uint8Array;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

const INTERNAL_KEY_RINGS = new WeakMap<ContinuationTokenKeyRing, InternalKeyRing>();

export type ContinuationTokenBinding = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
}>;

export type ContinuationTokenIssueInput = ContinuationTokenBinding & Readonly<{
  lastSequence: number;
}>;

export type ContinuationTokenFailure = Readonly<{
  ok: false;
  code: "CONTINUATION_INVALID";
}>;

export type ContinuationTokenVerification =
  | Readonly<{ ok: true; claims: ContinuationTokenClaims }>
  | ContinuationTokenFailure;

export type ContinuationTokenRotation =
  | Readonly<{ ok: true; token: ContinuationToken; claims: ContinuationTokenClaims }>
  | ContinuationTokenFailure;

export class ContinuationTokenKeyError extends Error {
  readonly code = "CONTINUATION_KEY_INVALID" as const;

  constructor() {
    super("CONTINUATION_KEY_INVALID");
    this.name = "ContinuationTokenKeyError";
  }
}

function signingKey(secret: string): Uint8Array {
  try {
    const decoded = base64url.decode(secret);
    if (decoded.byteLength < 32) throw new ContinuationTokenKeyError();
    return new Uint8Array(createHmac("sha256", decoded)
      .update("creciendo-continuation-signing-key.v1", "utf8")
      .digest());
  } catch (error) {
    if (error instanceof ContinuationTokenKeyError) throw error;
    throw new ContinuationTokenKeyError();
  }
}

export function createContinuationTokenKeyRing(input: Readonly<{
  current: ContinuationTokenKey;
  previous?: ContinuationTokenKey;
}>): ContinuationTokenKeyRing {
  if (!KID.test(input.current.kid)
    || (input.previous !== undefined && (!KID.test(input.previous.kid) || input.previous.kid === input.current.kid))) {
    throw new ContinuationTokenKeyError();
  }
  const currentKey = signingKey(input.current.secret);
  const entries: [string, Uint8Array][] = [[input.current.kid, currentKey]];
  if (input.previous) entries.push([input.previous.kid, signingKey(input.previous.secret)]);
  const ring = Object.freeze({
    currentKid: input.current.kid,
    verificationKids: Object.freeze(entries.map(([kid]) => kid)),
  });
  INTERNAL_KEY_RINGS.set(ring, Object.freeze({ currentKid: input.current.kid, currentKey, keys: new Map(entries) }));
  return ring;
}

function internalRing(ring: ContinuationTokenKeyRing): InternalKeyRing {
  const internal = INTERNAL_KEY_RINGS.get(ring);
  if (!internal) throw new ContinuationTokenKeyError();
  return internal;
}

function sha256(domain: string, values: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(`${domain}\n`, "utf8");
  for (const value of values) hash.update(`${value.length}:${value}\n`, "utf8");
  return hash.digest("hex");
}

function bindings(input: ContinuationTokenBinding) {
  return Object.freeze({
    sessionBindingSha256: sha256("creciendo-session-binding.v1", [input.session.productSessionId]),
    authorizationBindingSha256: sha256("creciendo-authorization-binding.v1", [
      input.scope.actorUserId,
      input.scope.careSpaceId,
      input.scope.childId,
    ]),
    securityVersionSha256: sha256("creciendo-security-version.v1", [input.scope.authorizationVersion]),
  });
}

function validBinding(input: ContinuationTokenBinding, now: Date): boolean {
  const { scope, session } = input;
  return Number.isFinite(now.getTime())
    && scope.actorUserId === session.ownerUserId
    && scope.careSpaceId === session.careSpaceId
    && scope.childId === session.childId
    && scope.authorizationVersion === session.authorizationVersion
    && now >= scope.issuedAt
    && now < scope.expiresAt
    && now < session.authorizationExpiresAt
    && Number.isSafeInteger(session.lastSequence)
    && session.lastSequence >= 0;
}

function sameHash(left: string, right: string): boolean {
  if (!HASH.test(left) || !HASH.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

const JWT_PAYLOAD_SCHEMA = z.object({
  ctv: z.literal(CONTINUATION_TOKEN_VERSION),
  iss: z.literal(CONTINUATION_TOKEN_ISSUER),
  aud: z.literal(CONTINUATION_TOKEN_AUDIENCE),
  jti: z.string().uuid(),
  sb: z.string().regex(HASH),
  ab: z.string().regex(HASH),
  sv: z.string().regex(HASH),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  iat: z.number().int().positive(),
  nbf: z.number().int().positive(),
  exp: z.number().int().positive(),
}).strict();

function normalizedClaims(payload: z.infer<typeof JWT_PAYLOAD_SCHEMA>): ContinuationTokenClaims {
  return CONTINUATION_TOKEN_CLAIMS_SCHEMA.parse({
    version: payload.ctv,
    issuer: payload.iss,
    audience: payload.aud,
    tokenId: payload.jti,
    sessionBindingSha256: payload.sb,
    authorizationBindingSha256: payload.ab,
    securityVersionSha256: payload.sv,
    lastSequence: payload.seq,
    issuedAt: payload.iat,
    notBefore: payload.nbf,
    expiresAt: payload.exp,
  });
}

const failure = Object.freeze({ ok: false as const, code: "CONTINUATION_INVALID" as const });

export async function issueContinuationToken(
  input: ContinuationTokenIssueInput,
  ring: ContinuationTokenKeyRing,
  now = new Date(),
): Promise<ContinuationToken> {
  const internal = internalRing(ring);
  if (!validBinding(input, now)
    || !Number.isSafeInteger(input.lastSequence)
    || input.lastSequence < 0
    || input.lastSequence > input.session.lastSequence) throw new ContinuationTokenKeyError();
  const bound = bindings(input);
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const expiresAt = Math.min(
    issuedAt + CONTINUATION_TOKEN_TTL_SECONDS,
    Math.floor(input.scope.expiresAt.getTime() / 1_000),
    Math.floor(input.session.authorizationExpiresAt.getTime() / 1_000),
  );
  if (expiresAt <= issuedAt) throw new ContinuationTokenKeyError();
  const token = await new SignJWT({
    ctv: CONTINUATION_TOKEN_VERSION,
    sb: bound.sessionBindingSha256,
    ab: bound.authorizationBindingSha256,
    sv: bound.securityVersionSha256,
    seq: input.lastSequence,
  })
    .setProtectedHeader({ alg: "HS256", typ: TOKEN_TYPE, kid: internal.currentKid })
    .setIssuer(CONTINUATION_TOKEN_ISSUER)
    .setAudience(CONTINUATION_TOKEN_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(internal.currentKey);
  if (new TextEncoder().encode(token).byteLength > MAX_TOKEN_BYTES) throw new ContinuationTokenKeyError();
  return token as ContinuationToken;
}

export async function verifyContinuationToken(
  token: ContinuationToken | string,
  expected: ContinuationTokenBinding,
  ring: ContinuationTokenKeyRing,
  now = new Date(),
): Promise<ContinuationTokenVerification> {
  try {
    if (typeof token !== "string" || new TextEncoder().encode(token).byteLength > MAX_TOKEN_BYTES || !validBinding(expected, now)) return failure;
    const header = decodeProtectedHeader(token);
    if (header.alg !== "HS256" || header.typ !== TOKEN_TYPE || typeof header.kid !== "string") return failure;
    const key = internalRing(ring).keys.get(header.kid);
    if (!key) return failure;
    const verified = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: CONTINUATION_TOKEN_ISSUER,
      audience: CONTINUATION_TOKEN_AUDIENCE,
      requiredClaims: ["iss", "aud", "jti", "iat", "nbf", "exp"],
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: now,
    });
    const parsed = JWT_PAYLOAD_SCHEMA.safeParse(verified.payload);
    if (!parsed.success) return failure;
    const claims = normalizedClaims(parsed.data);
    const bound = bindings(expected);
    if (!sameHash(claims.sessionBindingSha256, bound.sessionBindingSha256)
      || !sameHash(claims.authorizationBindingSha256, bound.authorizationBindingSha256)
      || !sameHash(claims.securityVersionSha256, bound.securityVersionSha256)
      || claims.lastSequence > expected.session.lastSequence) return failure;
    return Object.freeze({ ok: true as const, claims });
  } catch {
    return failure;
  }
}

export async function rotateContinuationToken(
  token: ContinuationToken | string,
  input: ContinuationTokenIssueInput,
  ring: ContinuationTokenKeyRing,
  now = new Date(),
): Promise<ContinuationTokenRotation> {
  const verified = await verifyContinuationToken(token, input, ring, now);
  if (!verified.ok || input.lastSequence < verified.claims.lastSequence) return failure;
  try {
    const rotated = await issueContinuationToken(input, ring, now);
    const next = await verifyContinuationToken(rotated, input, ring, now);
    return next.ok ? Object.freeze({ ok: true as const, token: rotated, claims: next.claims }) : failure;
  } catch {
    return failure;
  }
}
