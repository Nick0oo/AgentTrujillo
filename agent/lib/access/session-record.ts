import type { ActorUserId, AuthorizedChildScope, CareSpaceId, ChildId } from "./authorized-child-scope";
import type { Json } from "../supabase/database.types";

export type OwnedSessionRecord = Readonly<{
  productSessionId: string;
  eveSessionId: string | null;
  ownerUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  authorizationVersion: string;
  authorizationExpiresAt: Date;
  status: "active" | "completed" | "cancelled" | "archived";
  lastSequence: number;
}>;

export type CreateSessionInput = Readonly<{
  channel: "creciendo_mobile" | "operator_cli" | "evaluation";
  initialModel: string;
  initialConfiguration?: { [key: string]: Json | undefined };
}>;

export type SessionScopeIdentity = Pick<AuthorizedChildScope, "actorUserId" | "careSpaceId" | "childId" | "authorizationVersion">;
