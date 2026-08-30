import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import { NodeRequest } from "srvx/node";

import defaultChannel, {
  CRECIENDO_ROUTE_SPECS,
  MAX_REQUEST_BODY_BYTES,
  createCreciendoChannel,
  type CreciendoRouteHandlers,
} from "../../../agent/channels/creciendo";

const ALLOWED_ORIGIN = "https://app.creciendo.test";

function handlers(overrides: Partial<CreciendoRouteHandlers> = {}): CreciendoRouteHandlers {
  const ok = vi.fn(async () => Response.json({ ok: true }));
  return {
    onboarding: ok,
    childDirectory: ok,
    childContext: ok,
    dashboard: ok,
    createSession: ok,
    sendMessage: ok,
    streamSession: ok,
    cancelSession: ok,
    documentList: ok,
    uploadTicket: ok,
    documentUpload: ok,
    downloadTicket: ok,
    ocrDraft: ok,
    ...overrides,
  };
}

function route(channel: ReturnType<typeof createCreciendoChannel>, method: string, path: string) {
  const found = channel.routes.find((candidate) => candidate.method === method && candidate.path === path);
  if (!found || found.transport === "websocket") throw new Error("route_not_found");
  return found;
}

async function invoke(
  channel: ReturnType<typeof createCreciendoChannel>,
  method: "GET" | "POST" | "PUT",
  path: string,
  request: Request,
) {
  return route(channel, method, path).handler(request, {} as never);
}

describe("Creciendo Eve channel shell", () => {
  it("mounts the canonical public surface", () => {
    const channel = createCreciendoChannel({ handlers: handlers(), allowedOrigins: [ALLOWED_ORIGIN] });
    expect(channel.routes.map(({ method, path }) => ({ method, path }))).toEqual(CRECIENDO_ROUTE_SPECS);
    expect(channel.routes).toHaveLength(13);
    expect(channel.routes.some(({ path }) => path.startsWith("/eve/"))).toBe(false);
    expect(channel.receive).toBeUndefined();
    expect(channel.cors).toEqual({
      origin: [ALLOWED_ORIGIN],
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
      maxAge: "300",
      preflight: { statusCode: 204 },
    });
  });

  it("keeps the discovered default channel fail closed until route dependencies are composed", async () => {
    expect(defaultChannel.routes.map(({ method, path }) => ({ method, path }))).toEqual(CRECIENDO_ROUTE_SPECS);
    const response = await route(defaultChannel, "POST", "/creciendo/v1/sessions").handler(new Request(
      "https://agent.test/creciendo/v1/sessions",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    ), {} as never);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "CHANNEL_UNAVAILABLE" });
  });

  it("rejects an unapproved browser origin before invoking a dependency", async () => {
    const routeHandlers = handlers();
    const channel = createCreciendoChannel({ handlers: routeHandlers, allowedOrigins: [ALLOWED_ORIGIN] });
    const response = await invoke(channel, "POST", "/creciendo/v1/child-context", new Request(
      "https://agent.test/creciendo/v1/child-context",
      {
        method: "POST",
        headers: { origin: "https://evil.test", "content-type": "application/json" },
        body: "{}",
      },
    ));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "ORIGIN_DENIED" });
    expect(routeHandlers.childContext).not.toHaveBeenCalled();
  });

  it("requires JSON for commands and enforces actual and declared body limits", async () => {
    const routeHandlers = handlers();
    const channel = createCreciendoChannel({ handlers: routeHandlers, allowedOrigins: [] });
    const wrongType = await invoke(channel, "POST", "/creciendo/v1/sessions", new Request(
      "https://agent.test/creciendo/v1/sessions",
      { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" },
    ));
    expect(wrongType.status).toBe(415);

    const declaredLarge = await invoke(channel, "POST", "/creciendo/v1/sessions", new Request(
      "https://agent.test/creciendo/v1/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
        body: "{}",
      },
    ));
    expect(declaredLarge.status).toBe(413);

    const actualLarge = await invoke(channel, "POST", "/creciendo/v1/sessions", new Request(
      "https://agent.test/creciendo/v1/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(MAX_REQUEST_BODY_BYTES) }),
      },
    ));
    expect(actualLarge.status).toBe(413);
    expect(routeHandlers.createSession).not.toHaveBeenCalled();
  });

  it("passes a bounded replayable body and request abort signal to the selected handler", async () => {
    const selected = vi.fn(async (request: Request) => {
      expect(request.signal.aborted).toBe(false);
      expect(await request.json()).toEqual({ hello: "world" });
      return Response.json({ ok: true, internal: false }, { headers: { "x-powered-by": "hidden" } });
    });
    const channel = createCreciendoChannel({
      handlers: handlers({ createSession: selected }),
      allowedOrigins: [ALLOWED_ORIGIN],
    });
    const response = await invoke(channel, "POST", "/creciendo/v1/sessions", new Request(
      "https://agent.test/creciendo/v1/sessions",
      {
        method: "POST",
        headers: { origin: ALLOWED_ORIGIN, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ hello: "world" }),
      },
    ));
    expect(response.status).toBe(200);
    expect(selected).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.has("x-powered-by")).toBe(false);
  });

  it("adapts the srvx NodeRequest without relying on cross-implementation private slots", async () => {
    const selected = vi.fn(async (request: Request) => {
      expect(await request.json()).toEqual({ hello: "world" });
      return Response.json({ ok: true });
    });
    const channel = createCreciendoChannel({
      handlers: handlers({ createSession: selected }),
      allowedOrigins: [],
    });
    const incoming = Object.assign(Readable.from([Buffer.from("{\"hello\":\"world\"}")]), {
      method: "POST",
      url: "/creciendo/v1/sessions",
      headers: { host: "agent.test", "content-type": "application/json", "content-length": "17" },
      rawHeaders: ["Host", "agent.test", "Content-Type", "application/json", "Content-Length", "17"],
      complete: true,
      socket: { remoteAddress: "127.0.0.1", localAddress: "127.0.0.1", localPort: 2000 },
    });
    const foreignRequest = new NodeRequest({ req: incoming as never });

    const response = await invoke(channel, "POST", "/creciendo/v1/sessions", foreignRequest as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(selected).toHaveBeenCalledOnce();
  });

  it("maps dependency failures, caller aborts and deadlines without leaking causes", async () => {
    const failing = vi.fn(async () => { throw new Error("database password and child details"); });
    const channel = createCreciendoChannel({
      handlers: handlers({ childContext: failing }),
      allowedOrigins: [],
      requestTimeoutMs: 25,
    });
    const failure = await invoke(channel, "POST", "/creciendo/v1/child-context", new Request(
      "https://agent.test/creciendo/v1/child-context",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    ));
    expect(failure.status).toBe(503);
    expect(await failure.text()).toBe('{"ok":false,"code":"CHANNEL_UNAVAILABLE"}');

    const controller = new AbortController();
    controller.abort();
    const aborted = await invoke(channel, "GET", "/creciendo/v1/sessions/:sessionId/stream", new Request(
      "https://agent.test/creciendo/v1/sessions/ignored/stream",
      { signal: controller.signal },
    ));
    expect(aborted.status).toBe(408);

    const waiting = vi.fn(async (request: Request) => new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    }));
    const timedChannel = createCreciendoChannel({
      handlers: handlers({ streamSession: waiting }),
      allowedOrigins: [],
      requestTimeoutMs: 10,
    });
    const timed = await invoke(timedChannel, "GET", "/creciendo/v1/sessions/:sessionId/stream", new Request(
      "https://agent.test/creciendo/v1/sessions/ignored/stream",
    ));
    expect(timed.status).toBe(504);
    expect(await timed.json()).toEqual({ ok: false, code: "REQUEST_TIMEOUT" });
  });

  it("rejects invalid construction instead of broadening CORS or limits", () => {
    expect(() => createCreciendoChannel({ handlers: handlers(), allowedOrigins: ["*"] })).toThrowError("CRECIENDO_CHANNEL_CONFIG_INVALID");
    expect(() => createCreciendoChannel({ handlers: handlers(), allowedOrigins: ["http://app.test"] })).toThrowError("CRECIENDO_CHANNEL_CONFIG_INVALID");
    expect(() => createCreciendoChannel({ handlers: handlers(), allowedOrigins: [ALLOWED_ORIGIN, ALLOWED_ORIGIN] })).toThrowError("CRECIENDO_CHANNEL_CONFIG_INVALID");
    expect(() => createCreciendoChannel({ handlers: handlers(), allowedOrigins: [], requestTimeoutMs: 0 })).toThrowError("CRECIENDO_CHANNEL_CONFIG_INVALID");
  });
});
