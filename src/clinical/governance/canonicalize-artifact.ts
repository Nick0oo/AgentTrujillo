import { canonicalize } from "json-canonicalize";

import {
  DEFAULT_ARTIFACT_LIMITS,
  rulePackArtifactV1Schema,
  type ParsedRulePackArtifactV1,
} from "./artifact-schema";
import type { ArtifactLimits, RulePackArtifactV1 } from "./artifact-types";

export type ArtifactParseErrorCode =
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_JSON"
  | "DUPLICATE_KEY"
  | "LIMIT_EXCEEDED"
  | "UNKNOWN_FIELD"
  | "INVALID_IDENTITY"
  | "NON_CANONICAL_VALUE";

export class ArtifactParseError extends Error {
  readonly code: ArtifactParseErrorCode;

  constructor(code: ArtifactParseErrorCode, message: string = code) {
    super(message);
    this.name = "ArtifactParseError";
    this.code = code;
  }
}

function hasUnsafeNumber(value: unknown): boolean {
  return typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value) && Number.isInteger(value));
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function validateData(value: unknown, limits: ArtifactLimits, depth = 0, state = { nodes: 0 }): void {
  if (depth > limits.maxDepth || ++state.nodes > limits.maxNodes) throw new ArtifactParseError("LIMIT_EXCEEDED");
  if (typeof value === "string" && hasUnpairedSurrogate(value)) throw new ArtifactParseError("NON_CANONICAL_VALUE");
  if (hasUnsafeNumber(value) || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new ArtifactParseError("NON_CANONICAL_VALUE");
  }
  if (Array.isArray(value)) {
    value.forEach((item) => validateData(item, limits, depth + 1, state));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new ArtifactParseError("NON_CANONICAL_VALUE");
      validateData(item, limits, depth + 1, state);
    }
  }
}

function skipWhitespace(input: string, index: number): number {
  while (index < input.length && /\s/.test(input[index])) index += 1;
  return index;
}

function scanString(input: string, index: number): number {
  let escaped = false;
  for (let i = index + 1; i < input.length; i += 1) {
    const char = input[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') return i + 1;
  }
  throw new ArtifactParseError("INVALID_JSON");
}

function scanValue(input: string, start: number): number {
  const index = skipWhitespace(input, start);
  if (input[index] === '"') return scanString(input, index);
  if (input[index] === "{" || input[index] === "[") {
    const opening = input[index];
    const closing = opening === "{" ? "}" : "]";
    let cursor = skipWhitespace(input, index + 1);
    if (input[cursor] === closing) return cursor + 1;
    while (cursor < input.length) {
      if (opening === "{") {
        if (input[cursor] !== '"') throw new ArtifactParseError("INVALID_JSON");
        cursor = scanString(input, cursor);
        cursor = skipWhitespace(input, cursor);
        if (input[cursor] !== ":") throw new ArtifactParseError("INVALID_JSON");
        cursor = scanValue(input, cursor + 1);
      } else {
        cursor = scanValue(input, cursor);
      }
      cursor = skipWhitespace(input, cursor);
      if (input[cursor] === closing) return cursor + 1;
      if (input[cursor] !== ",") throw new ArtifactParseError("INVALID_JSON");
      cursor = skipWhitespace(input, cursor + 1);
    }
    throw new ArtifactParseError("INVALID_JSON");
  }
  const match = input.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!match) throw new ArtifactParseError("INVALID_JSON");
  return index + match[0].length;
}

function assertNoDuplicateKeys(input: string): void {
  function scanObject(start: number): number {
    let cursor = skipWhitespace(input, start + 1);
    const keys = new Set<string>();
    if (input[cursor] === "}") return cursor + 1;
    while (cursor < input.length) {
      if (input[cursor] !== '"') throw new ArtifactParseError("INVALID_JSON");
      const keyStart = cursor;
      const keyEnd = scanString(input, cursor);
      const key = JSON.parse(input.slice(keyStart, keyEnd)) as string;
      if (keys.has(key)) throw new ArtifactParseError("DUPLICATE_KEY", key);
      keys.add(key);
      cursor = skipWhitespace(input, keyEnd);
      if (input[cursor] !== ":") throw new ArtifactParseError("INVALID_JSON");
      cursor = scanNested(cursor + 1);
      cursor = skipWhitespace(input, cursor);
      if (input[cursor] === "}") return cursor + 1;
      if (input[cursor] !== ",") throw new ArtifactParseError("INVALID_JSON");
      cursor = skipWhitespace(input, cursor + 1);
    }
    throw new ArtifactParseError("INVALID_JSON");
  }
  function scanNested(start: number): number {
    const cursor = skipWhitespace(input, start);
    if (input[cursor] === "{") return scanObject(cursor);
    if (input[cursor] === "[") {
      let position = skipWhitespace(input, cursor + 1);
      if (input[position] === "]") return position + 1;
      while (position < input.length) {
        position = scanNested(position);
        position = skipWhitespace(input, position);
        if (input[position] === "]") return position + 1;
        if (input[position] !== ",") throw new ArtifactParseError("INVALID_JSON");
        position = skipWhitespace(input, position + 1);
      }
      throw new ArtifactParseError("INVALID_JSON");
    }
    return scanValue(input, cursor);
  }
  const end = scanNested(0);
  if (skipWhitespace(input, end) !== input.length) throw new ArtifactParseError("INVALID_JSON");
}

export function parseRulePackArtifact<T = unknown>(input: string | unknown, limits: ArtifactLimits = DEFAULT_ARTIFACT_LIMITS): ParsedRulePackArtifactV1<T> {
  let value: unknown;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > limits.maxBytes) throw new ArtifactParseError("LIMIT_EXCEEDED");
    try { assertNoDuplicateKeys(input); value = JSON.parse(input); } catch (error) {
      if (error instanceof ArtifactParseError) throw error;
      throw new ArtifactParseError("INVALID_JSON");
    }
  } else {
    value = input;
  }
  validateData(value, limits);
  const parsed = rulePackArtifactV1Schema.safeParse(value);
  if (!parsed.success) {
    const schemaVersion = value && typeof value === "object" && "schemaVersion" in value ? value.schemaVersion : undefined;
    throw new ArtifactParseError(schemaVersion !== "1" ? "UNSUPPORTED_SCHEMA" : "UNKNOWN_FIELD", parsed.error.issues[0]?.message);
  }
  return parsed.data as unknown as ParsedRulePackArtifactV1<T>;
}

function sortedArtifact<T>(artifact: RulePackArtifactV1<T>): RulePackArtifactV1<T> {
  return {
    ...artifact,
    header: {
      ...artifact.header,
      sourceReferences: [...artifact.header.sourceReferences].sort((left, right) => left.artifactSha256.localeCompare(right.artifactSha256) || left.purpose.localeCompare(right.purpose)),
    },
  };
}

export function canonicalizeRulePackArtifact<T>(artifact: RulePackArtifactV1<T>): Uint8Array {
  const parsed = parseRulePackArtifact(artifact);
  const canonical = canonicalize(sortedArtifact(parsed));
  const bytes = new TextEncoder().encode(canonical);
  if (bytes.byteLength > DEFAULT_ARTIFACT_LIMITS.maxBytes) throw new ArtifactParseError("LIMIT_EXCEEDED");
  return bytes;
}
