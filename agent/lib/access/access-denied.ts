export type AccessDenied = Readonly<{
  ok: false;
  code: "ACCESS_DENIED";
  requestId: string;
}>;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function createAccessDenied(requestId: string): AccessDenied {
  return Object.freeze({
    ok: false as const,
    code: "ACCESS_DENIED" as const,
    requestId: REQUEST_ID_PATTERN.test(requestId) ? requestId : "invalid-request-id",
  });
}

export class AccessDeniedError extends Error {
  readonly denial: AccessDenied;

  constructor(requestId: string) {
    super("ACCESS_DENIED");
    this.name = "AccessDeniedError";
    this.denial = createAccessDenied(requestId);
  }
}
