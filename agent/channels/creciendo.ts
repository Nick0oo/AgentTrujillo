import {
  GET,
  POST,
  PUT,
  defineChannel,
  type HttpRouteDefinition,
} from "eve/channels";

import { loadRuntimeConfig } from "../lib/config/env";
import {
  createCreciendoAuthDependencies,
  withChannelAuth,
  type AuthenticatedChannelHandler,
  type AuthenticatedChannelRequest,
  type CreciendoAuthDependencies,
} from "../../src/channels/creciendo/auth-middleware";
import {
  createChildContextRouteDependencies,
  handleChildContext,
  type ChildContextRouteDependencies,
} from "../../src/channels/creciendo/routes/child-context";
import {
  createSessionCreateRouteDependencies,
  handleCreateSession,
  type SessionCreateRouteDependencies,
} from "../../src/channels/creciendo/routes/session-create";
import {
  createEveMessageDispatcher,
  createSessionMessageRouteDependencies,
  handleSessionMessage,
  type SessionMessageRouteBaseDependencies,
} from "../../src/channels/creciendo/routes/session-message";
import {
  createSessionStreamRouteDependencies,
  handleSessionStream,
  type SessionStreamRouteBaseDependencies,
} from "../../src/channels/creciendo/routes/session-stream";
import {
  createEveCancellationPort,
  createSessionCancelRouteDependencies,
  handleCancelSession,
  type SessionCancelRouteBaseDependencies,
} from "../../src/channels/creciendo/routes/session-cancel";
import {
  createRpcOnboardingPersistence,
  handleOnboarding,
  type OnboardingRouteDependencies,
} from "../../src/channels/creciendo/routes/onboarding";
import {
  createChildDirectoryRouteDependencies,
  handleChildDirectory,
  type ChildDirectoryResolver,
} from "../../src/channels/creciendo/routes/child-directory";
import {
  createDashboardRouteDependencies,
  handleDashboard,
  type DashboardResolver,
} from "../../src/channels/creciendo/routes/dashboard";
import {
  handleDocumentList,
  handleUploadTicket,
  handleDocumentUpload,
  handleDownloadTicket,
  handleOcrDraft,
  type DocumentRouteDependencies,
} from "../../src/channels/creciendo/routes/documents";
import { createDocumentRouteDependencies } from "../../src/channels/creciendo/routes/documents";
import { createSupabaseDocumentPersistence } from "../../src/channels/creciendo/document-persistence";
import {
  handleAnthropometryCreate,
  handleAnthropometryList,
  handleGrowthSummary,
  createGrowthScopeResolver,
  type AnthropometryRouteDependencies,
} from "../../src/channels/creciendo/routes/anthropometry";
import { createSupabaseAnthropometryPersistence } from "../../src/channels/creciendo/anthropometry-persistence";
import { createChildContextTokenService, type ChildContextTokenService } from "../lib/access/child-context-token";
import { createAuthorizeChildService, type AuthorizeChildService } from "../lib/access/authorize-child-service";

export const MAX_REQUEST_BODY_BYTES = 64 * 1_024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export const CRECIENDO_ROUTE_SPECS = Object.freeze([
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/onboarding" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/children" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/child-context" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/dashboard" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/anthropometry" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/anthropometry" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/anthropometry/growth" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/sessions" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/sessions/:sessionId/messages" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/sessions/:sessionId/stream" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/sessions/:sessionId/cancel" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/documents" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/documents/upload-ticket" }),
  Object.freeze({ method: "PUT" as const, path: "/creciendo/v1/documents/upload" }),
  Object.freeze({ method: "POST" as const, path: "/creciendo/v1/documents/download-ticket" }),
  Object.freeze({ method: "GET" as const, path: "/creciendo/v1/documents/:documentId/ocr-draft" }),
]);

export type CreciendoRouteHandler = HttpRouteDefinition["handler"];

export type CreciendoRouteHandlers = Readonly<{
  onboarding: CreciendoRouteHandler;
  childDirectory: CreciendoRouteHandler;
  childContext: CreciendoRouteHandler;
  dashboard: CreciendoRouteHandler;
  anthropometryCreate: CreciendoRouteHandler;
  anthropometryList: CreciendoRouteHandler;
  growthSummary: CreciendoRouteHandler;
  createSession: CreciendoRouteHandler;
  sendMessage: CreciendoRouteHandler;
  streamSession: CreciendoRouteHandler;
  cancelSession: CreciendoRouteHandler;
  documentList: CreciendoRouteHandler;
  uploadTicket: CreciendoRouteHandler;
  documentUpload: CreciendoRouteHandler;
  downloadTicket: CreciendoRouteHandler;
  ocrDraft: CreciendoRouteHandler;
}>;

export type CreciendoChannelDependencies = Readonly<{
  handlers: CreciendoRouteHandlers;
  allowedOrigins: readonly string[];
  requestTimeoutMs?: number;
}>;

type BoundaryCode =
  | "ORIGIN_DENIED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TOO_LARGE"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT"
  | "CHANNEL_UNAVAILABLE";

class BoundaryError extends Error {
  constructor(readonly status: number, readonly code: BoundaryCode) {
    super(code);
    this.name = "CreciendoChannelBoundaryError";
  }
}

function errorResponse(status: number, code: BoundaryCode): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function validateOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:"
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === "";
  } catch {
    return false;
  }
}

function validateDependencies(input: CreciendoChannelDependencies): void {
  const handlers = input.handlers;
  if (!handlers
    || Object.values(handlers).length !== 16
    || Object.values(handlers).some((handler) => typeof handler !== "function")
    || input.allowedOrigins.length > 16
    || new Set(input.allowedOrigins).size !== input.allowedOrigins.length
    || input.allowedOrigins.some((origin) => !validateOrigin(origin))
    || (input.requestTimeoutMs !== undefined
      && (!Number.isInteger(input.requestTimeoutMs)
        || input.requestTimeoutMs < 1
        || input.requestTimeoutMs > 120_000))) {
    throw new Error("CRECIENDO_CHANNEL_CONFIG_INVALID");
  }
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) throw new BoundaryError(413, "REQUEST_TOO_LARGE");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new BoundaryError(413, "REQUEST_TOO_LARGE");
  return value;
}

async function readBoundedBody(request: Request, signal: AbortSignal, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = declaredLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new BoundaryError(413, "REQUEST_TOO_LARGE");
  }
  if (request.body === null) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancel = () => { void reader.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BoundaryError(413, "REQUEST_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function normalizeResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("server");
  headers.delete("set-cookie");
  headers.delete("x-powered-by");
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function boundary(
  handler: CreciendoRouteHandler,
  input: Readonly<{ allowedOrigins: ReadonlySet<string>; timeoutMs: number; json: boolean; readBody?: boolean; maxBodyBytes?: number }>,
): CreciendoRouteHandler {
  return async (request, args) => {
    const origin = request.headers.get("origin");
    if (origin !== null && !input.allowedOrigins.has(origin)) return errorResponse(403, "ORIGIN_DENIED");
    if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
    if (input.json && request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE");
    }

    const controller = new AbortController();
    let timedOut = false;
    const callerAbort = () => controller.abort(new Error("REQUEST_ABORTED"));
    request.signal.addEventListener("abort", callerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("REQUEST_TIMEOUT"));
    }, input.timeoutMs);

    try {
      const shouldReadBody = input.readBody ?? input.json;
      const body = shouldReadBody ? await readBoundedBody(request, controller.signal, input.maxBodyBytes ?? MAX_REQUEST_BODY_BYTES) : undefined;
      const boundedRequest = new Request(request.url, {
        method: request.method,
        headers: new Headers(request.headers),
        ...(body === undefined ? {} : { body: body.buffer }),
        signal: controller.signal,
      });
      const response = await Promise.race([
        handler(boundedRequest, args),
        abortPromise(controller.signal),
      ]);
      if (!(response instanceof Response)) return errorResponse(503, "CHANNEL_UNAVAILABLE");
      return normalizeResponse(response);
    } catch (error) {
      if (error instanceof BoundaryError) return errorResponse(error.status, error.code);
      if (timedOut) return errorResponse(504, "REQUEST_TIMEOUT");
      if (request.signal.aborted) return errorResponse(408, "REQUEST_ABORTED");
      return errorResponse(503, "CHANNEL_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", callerAbort);
    }
  };
}

export function createCreciendoChannel(dependencies: CreciendoChannelDependencies) {
  validateDependencies(dependencies);
  const allowedOrigins = new Set(dependencies.allowedOrigins);
  const timeoutMs = dependencies.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  return defineChannel({
    cors: {
      origin: [...dependencies.allowedOrigins],
      methods: ["GET", "POST", "PUT"],
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "Last-Event-ID",
        "X-Child-Context",
        "X-Continuation-Token",
        "X-Creciendo-Channel-Version",
        "X-Creciendo-Event-Version",
        "X-Request-Id",
        "X-Content-SHA256",
      ],
      exposeHeaders: [
        "Content-Type",
        "Retry-After",
        "X-Creciendo-Channel-Version",
        "X-Creciendo-Event-Version",
        "X-Request-Id",
      ],
      credentials: false,
      maxAge: 300,
      preflight: { statusCode: 204 },
    },
    routes: [
      POST(CRECIENDO_ROUTE_SPECS[0].path, boundary(dependencies.handlers.onboarding, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[1].path, boundary(dependencies.handlers.childDirectory, { allowedOrigins, timeoutMs, json: false })),
      POST(CRECIENDO_ROUTE_SPECS[2].path, boundary(dependencies.handlers.childContext, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[3].path, boundary(dependencies.handlers.dashboard, { allowedOrigins, timeoutMs, json: false })),
      POST(CRECIENDO_ROUTE_SPECS[4].path, boundary(dependencies.handlers.anthropometryCreate, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[5].path, boundary(dependencies.handlers.anthropometryList, { allowedOrigins, timeoutMs, json: false, readBody: false })),
      GET(CRECIENDO_ROUTE_SPECS[6].path, boundary(dependencies.handlers.growthSummary, { allowedOrigins, timeoutMs, json: false, readBody: false })),
      POST(CRECIENDO_ROUTE_SPECS[7].path, boundary(dependencies.handlers.createSession, { allowedOrigins, timeoutMs, json: true })),
      POST(CRECIENDO_ROUTE_SPECS[8].path, boundary(dependencies.handlers.sendMessage, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[9].path, boundary(dependencies.handlers.streamSession, { allowedOrigins, timeoutMs, json: false })),
      POST(CRECIENDO_ROUTE_SPECS[10].path, boundary(dependencies.handlers.cancelSession, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[11].path, boundary(dependencies.handlers.documentList, { allowedOrigins, timeoutMs, json: false, readBody: false })),
      POST(CRECIENDO_ROUTE_SPECS[12].path, boundary(dependencies.handlers.uploadTicket, { allowedOrigins, timeoutMs, json: true })),
      PUT(CRECIENDO_ROUTE_SPECS[13].path, boundary(dependencies.handlers.documentUpload, { allowedOrigins, timeoutMs, json: false, readBody: true, maxBodyBytes: 52_428_800 })),
      POST(CRECIENDO_ROUTE_SPECS[14].path, boundary(dependencies.handlers.downloadTicket, { allowedOrigins, timeoutMs, json: true })),
      GET(CRECIENDO_ROUTE_SPECS[15].path, boundary(dependencies.handlers.ocrDraft, { allowedOrigins, timeoutMs, json: false, readBody: false })),
    ],
  });
}

const unavailable: CreciendoRouteHandler = async () => errorResponse(503, "CHANNEL_UNAVAILABLE");

let productionAuthDependencies: CreciendoAuthDependencies | undefined;

let productionOnboardingDependencies: OnboardingRouteDependencies | undefined;

function getProductionOnboardingDependencies(): OnboardingRouteDependencies {
  productionOnboardingDependencies ??= Object.freeze({ persistence: createRpcOnboardingPersistence(loadRuntimeConfig(process.env)) });
  return productionOnboardingDependencies;
}

function getProductionAuthDependencies(): CreciendoAuthDependencies {
  productionAuthDependencies ??= createCreciendoAuthDependencies(loadRuntimeConfig(process.env));
  return productionAuthDependencies;
}

export function withProductionChannelAuth(handler: AuthenticatedChannelHandler): CreciendoRouteHandler {
  let authenticated: CreciendoRouteHandler | undefined;
  return async (request, args) => {
    if (!authenticated) {
      try {
        authenticated = withChannelAuth(handler, getProductionAuthDependencies());
      } catch {
        return unavailable(request, args);
      }
    }
    return authenticated(request, args);
  };
}

let productionChildContextDependencies: ChildContextRouteDependencies | undefined;

let productionChildDirectoryDependencies: Readonly<{ resolver: ChildDirectoryResolver }> | undefined;

function getProductionChildDirectoryDependencies() {
  productionChildDirectoryDependencies ??= createChildDirectoryRouteDependencies(loadRuntimeConfig(process.env));
  return productionChildDirectoryDependencies;
}

const productionChildDirectory: AuthenticatedChannelHandler = (request, auth) =>
  handleChildDirectory(request, auth, getProductionChildDirectoryDependencies());
const guardedChildDirectory = withProductionChannelAuth(productionChildDirectory);

function getProductionChildContextDependencies(): ChildContextRouteDependencies {
  productionChildContextDependencies ??= createChildContextRouteDependencies(loadRuntimeConfig(process.env));
  return productionChildContextDependencies;
}

const productionChildContext: AuthenticatedChannelHandler = (request, auth) =>
  handleChildContext(request, auth, getProductionChildContextDependencies());
const guardedChildContext = withProductionChannelAuth(productionChildContext);

let productionDashboardDependencies: Readonly<{
  tokens: ChildContextTokenService;
  authorizeChild: AuthorizeChildService;
  resolver: DashboardResolver;
}> | undefined;

function getProductionDashboardDependencies() {
  productionDashboardDependencies ??= createDashboardRouteDependencies(loadRuntimeConfig(process.env));
  return productionDashboardDependencies;
}

const productionDashboard: AuthenticatedChannelHandler = (request, auth) =>
  handleDashboard(request, auth, getProductionDashboardDependencies());
const guardedDashboard = withProductionChannelAuth(productionDashboard);

function getProductionAnthropometryDependencies(auth: AuthenticatedChannelRequest): AnthropometryRouteDependencies {
  const config = loadRuntimeConfig(process.env);
  return Object.freeze({
    scope: createGrowthScopeResolver({
      tokens: createChildContextTokenService(config),
      authorizeChild: createAuthorizeChildService(config),
    }),
    persistence: createSupabaseAnthropometryPersistence({ config, auth }),
  });
}

const productionAnthropometryCreate: AuthenticatedChannelHandler = (request, auth) =>
  handleAnthropometryCreate(request, auth, getProductionAnthropometryDependencies(auth));
const productionAnthropometryList: AuthenticatedChannelHandler = (request, auth) =>
  handleAnthropometryList(request, auth, getProductionAnthropometryDependencies(auth));
const productionGrowthSummary: AuthenticatedChannelHandler = (request, auth) =>
  handleGrowthSummary(request, auth, getProductionAnthropometryDependencies(auth));
const guardedAnthropometryCreate = withProductionChannelAuth(productionAnthropometryCreate);
const guardedAnthropometryList = withProductionChannelAuth(productionAnthropometryList);
const guardedGrowthSummary = withProductionChannelAuth(productionGrowthSummary);

let productionSessionCreateDependencies: SessionCreateRouteDependencies | undefined;

function getProductionSessionCreateDependencies(): SessionCreateRouteDependencies {
  productionSessionCreateDependencies ??= createSessionCreateRouteDependencies(loadRuntimeConfig(process.env));
  return productionSessionCreateDependencies;
}

const productionSessionCreate: AuthenticatedChannelHandler = (request, auth) =>
  handleCreateSession(request, auth, getProductionSessionCreateDependencies());
const guardedSessionCreate = withProductionChannelAuth(productionSessionCreate);

let productionSessionMessageRuntime: Readonly<{
  config: ReturnType<typeof loadRuntimeConfig>;
  dependencies: SessionMessageRouteBaseDependencies;
}> | undefined;

function getProductionSessionMessageRuntime() {
  productionSessionMessageRuntime ??= (() => {
    const config = loadRuntimeConfig(process.env);
    return Object.freeze({
      config,
      dependencies: createSessionMessageRouteDependencies(config),
    });
  })();
  return productionSessionMessageRuntime;
}

const productionSessionMessage: AuthenticatedChannelHandler = (request, auth, args) => {
  const runtime = getProductionSessionMessageRuntime();
  return handleSessionMessage(request, auth, {
    ...runtime.dependencies,
    sessionId: args.params.sessionId ?? "",
    eve: createEveMessageDispatcher({
      send: args.send,
      resolveActiveSession: args.resolveActiveSession,
      getSession: args.getSession,
    }, runtime.config),
  });
};
const guardedSessionMessage = withProductionChannelAuth(productionSessionMessage);

let productionSessionStreamDependencies: SessionStreamRouteBaseDependencies | undefined;

function getProductionSessionStreamDependencies(): SessionStreamRouteBaseDependencies {
  productionSessionStreamDependencies ??= createSessionStreamRouteDependencies(loadRuntimeConfig(process.env));
  return productionSessionStreamDependencies;
}

const productionSessionStream: AuthenticatedChannelHandler = (request, auth, args) =>
  handleSessionStream(request, auth, {
    ...getProductionSessionStreamDependencies(),
    sessionId: args.params.sessionId ?? "",
    async abortWork(authorization) {
      try {
        if (authorization.session.eveSessionId === null) return;
        const session = args.getSession(authorization.session.eveSessionId);
        const resolved = await args.resolveActiveSession({ continuationToken: session.continuationToken });
        if (resolved?.sessionId === authorization.session.eveSessionId) await session.cancel();
      } catch {
        // Stream byte suppression remains authoritative if Eve cancellation is unavailable.
      }
    },
  });
const guardedSessionStream = withProductionChannelAuth(productionSessionStream);

let productionSessionCancelRuntime: Readonly<{
  config: ReturnType<typeof loadRuntimeConfig>;
  dependencies: SessionCancelRouteBaseDependencies;
}> | undefined;

function getProductionSessionCancelRuntime() {
  productionSessionCancelRuntime ??= (() => {
    const config = loadRuntimeConfig(process.env);
    return Object.freeze({ config, dependencies: createSessionCancelRouteDependencies(config) });
  })();
  return productionSessionCancelRuntime;
}

const productionSessionCancel: AuthenticatedChannelHandler = (request, auth, args) => {
  const runtime = getProductionSessionCancelRuntime();
  return handleCancelSession(request, auth, {
    ...runtime.dependencies,
    sessionId: args.params.sessionId ?? "",
    eve: createEveCancellationPort({
      cancel: args.cancel,
      resolveActiveSession: args.resolveActiveSession,
      getSession: args.getSession,
    }, runtime.config),
  });
};
const guardedSessionCancel = withProductionChannelAuth(productionSessionCancel);
const productionOnboarding: AuthenticatedChannelHandler = (request, auth) =>
  handleOnboarding(request, auth, getProductionOnboardingDependencies());
const guardedOnboarding = withProductionChannelAuth(productionOnboarding);

function getProductionDocumentDependencies(request: Request, auth: AuthenticatedChannelRequest): DocumentRouteDependencies {
  const config = loadRuntimeConfig(process.env);
  return createDocumentRouteDependencies(config, createSupabaseDocumentPersistence({
    config,
    auth,
    baseUrl: new URL(request.url).origin,
  }));
}

const productionDocumentList: AuthenticatedChannelHandler = (request, auth) =>
  handleDocumentList(request, auth, getProductionDocumentDependencies(request, auth));
const guardedDocumentList = withProductionChannelAuth(productionDocumentList);
const productionUploadTicket: AuthenticatedChannelHandler = (request, auth) =>
  handleUploadTicket(request, auth, getProductionDocumentDependencies(request, auth));
const guardedUploadTicket = withProductionChannelAuth(productionUploadTicket);
const productionDocumentUpload: AuthenticatedChannelHandler = (request, auth) =>
  handleDocumentUpload(request, auth, getProductionDocumentDependencies(request, auth));
const guardedDocumentUpload = withProductionChannelAuth(productionDocumentUpload);
const productionDownloadTicket: AuthenticatedChannelHandler = (request, auth) =>
  handleDownloadTicket(request, auth, getProductionDocumentDependencies(request, auth));
const guardedDownloadTicket = withProductionChannelAuth(productionDownloadTicket);
const productionOcrDraft: AuthenticatedChannelHandler = (request, auth, args) =>
  handleOcrDraft(request, auth, getProductionDocumentDependencies(request, auth), args);
const guardedOcrDraft = withProductionChannelAuth(productionOcrDraft);

export default createCreciendoChannel({
  handlers: {
    onboarding: guardedOnboarding,
    childDirectory: guardedChildDirectory,
    childContext: guardedChildContext,
    dashboard: guardedDashboard,
    anthropometryCreate: guardedAnthropometryCreate,
    anthropometryList: guardedAnthropometryList,
    growthSummary: guardedGrowthSummary,
    createSession: guardedSessionCreate,
    sendMessage: guardedSessionMessage,
    streamSession: guardedSessionStream,
    cancelSession: guardedSessionCancel,
    documentList: guardedDocumentList,
    uploadTicket: guardedUploadTicket,
    documentUpload: guardedDocumentUpload,
    downloadTicket: guardedDownloadTicket,
    ocrDraft: guardedOcrDraft,
  },
  allowedOrigins: [],
});
