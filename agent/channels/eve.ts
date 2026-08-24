import { eveChannel } from "eve/channels/eve";
import {
  ForbiddenError,
  isLoopbackRequest,
  localDev,
  type AuthFn,
} from "eve/channels/auth";

type InternalEveEnvironment = Readonly<Record<string, string | undefined>>;

export type InternalChannelPolicy = Readonly<{
  appEnv: "development" | "test" | "preview" | "production" | "invalid";
  mode: "disabled" | "local-loopback";
}>;

function disabledPolicy(appEnv: InternalChannelPolicy["appEnv"]): InternalChannelPolicy {
  return Object.freeze({ appEnv, mode: "disabled" });
}

export function resolveInternalChannelPolicy(environment: InternalEveEnvironment): InternalChannelPolicy {
  const rawAppEnv = environment.APP_ENV?.trim().toLowerCase();
  const appEnv = rawAppEnv === "development"
    || rawAppEnv === "test"
    || rawAppEnv === "preview"
    || rawAppEnv === "production"
    ? rawAppEnv
    : "invalid";
  const requestedMode = environment.EVE_INTERNAL_CHANNEL_MODE?.trim().toLowerCase();
  const vercelEnv = environment.VERCEL_ENV?.trim().toLowerCase();
  const deployedOnVercel = vercelEnv === "preview" || vercelEnv === "production";
  const invalidVercelEnv = vercelEnv !== undefined
    && vercelEnv !== ""
    && vercelEnv !== "development"
    && !deployedOnVercel;

  if (requestedMode !== undefined && requestedMode !== "" && requestedMode !== "local" && requestedMode !== "disabled") {
    return disabledPolicy(appEnv);
  }
  if (requestedMode === "disabled"
    || deployedOnVercel
    || invalidVercelEnv
    || appEnv === "preview"
    || appEnv === "production"
    || appEnv === "invalid") {
    return disabledPolicy(appEnv);
  }
  return Object.freeze({ appEnv, mode: "local-loopback" });
}

function denyInternalChannel(): never {
  throw new ForbiddenError();
}

export function createInternalEveAuth(
  environment: InternalEveEnvironment = process.env,
): readonly AuthFn<Request>[] {
  const policy = resolveInternalChannelPolicy(environment);
  if (policy.mode === "disabled") return Object.freeze([denyInternalChannel]);

  const authenticateLocal = localDev();
  const strictLoopback: AuthFn<Request> = async (request) => {
    if (!isLoopbackRequest(request)) return denyInternalChannel();
    return await authenticateLocal(request) ?? denyInternalChannel();
  };
  return Object.freeze([strictLoopback]);
}

export const INTERNAL_EVE_AUTH = createInternalEveAuth();

export default eveChannel({
  // Creciendo uses only /creciendo/v1. Keep Eve's operator surface available
  // to local tooling without admitting guardian or deployment bearer tokens.
  auth: INTERNAL_EVE_AUTH,
});
