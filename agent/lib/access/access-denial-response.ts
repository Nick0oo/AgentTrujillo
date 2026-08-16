import { createAccessDenied } from "./access-denied";

export type AccessDenialResponse = Readonly<{
  status: 404;
  headers: Readonly<{
    "cache-control": "no-store";
    "content-type": "application/json";
  }>;
  body: Readonly<{
    ok: false;
    code: "ACCESS_DENIED";
    requestId: string;
  }>;
}>;

export function createAccessDenialResponse(requestId: string): AccessDenialResponse {
  const denial = createAccessDenied(requestId);
  return Object.freeze({
    status: 404 as const,
    headers: Object.freeze({ "cache-control": "no-store" as const, "content-type": "application/json" as const }),
    body: denial,
  });
}

export function serializeAccessDenialResponse(response: AccessDenialResponse): string {
  return JSON.stringify({ ok: response.body.ok, code: response.body.code, requestId: response.body.requestId });
}
