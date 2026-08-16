import { z } from "zod";

import type { ActorUserId, CareSpaceId, ChildId, ChildPermission } from "./authorized-child-scope";

export type SignedChildContext = string & { readonly __brand: "SignedChildContext" };

export type VerifiedChildContextClaims = Readonly<{
  actorUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  permissions: readonly ChildPermission[];
  countryOfCare: "CO" | "US";
  timezone: string;
  authorizationVersion: string;
  tokenId: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export const CHILD_CONTEXT_ISSUER = "agent-trujillo";
export const CHILD_CONTEXT_AUDIENCE = "creciendo-child-context";
export const CHILD_CONTEXT_TYPE = "child-context+jwt";
export const CHILD_CONTEXT_VERSION = 1;
export const CHILD_CONTEXT_TTL_SECONDS = 120;
export const CHILD_CONTEXT_CLOCK_SKEW_SECONDS = 15;

export const childContextClaimsSchema = z.object({
  ctx_v: z.literal(CHILD_CONTEXT_VERSION),
  iss: z.literal(CHILD_CONTEXT_ISSUER),
  aud: z.literal(CHILD_CONTEXT_AUDIENCE),
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  care_space_id: z.string().uuid(),
  child_id: z.string().uuid(),
  permissions: z.array(z.enum(["read", "record", "manage_documents", "manage_medication", "manage_guardians"])).min(1),
  country_of_care: z.enum(["CO", "US"]),
  timezone: z.string().min(1),
  authorization_version: z.string().regex(/^m:[1-9][0-9]*:a:[1-9][0-9]*$/),
  iat: z.number().int().positive(),
  nbf: z.number().int().positive(),
  exp: z.number().int().positive(),
}).strict();

export type ChildContextClaims = z.infer<typeof childContextClaimsSchema>;
