import type { Sha256Hex } from "../governance/source-types.ts";
import type { ExactClinicalDecimal } from "./types.ts";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function createExactClinicalDecimal(lexeme: string): ExactClinicalDecimal {
  if (!DECIMAL.test(lexeme)) throw new Error("INVALID_CLINICAL_DECIMAL");
  const negative = lexeme.startsWith("-");
  const unsigned = negative ? lexeme.slice(1) : lexeme;
  const [whole, fraction = ""] = unsigned.split(".");
  const scale = fraction.length;
  const digits = `${whole}${fraction}`;
  const scaled = BigInt(digits || "0");
  const sign = scaled === 0n ? 0 : negative ? -1 : 1;
  return Object.freeze({
    lexeme,
    canonical: lexeme,
    scaledInteger: (negative && scaled !== 0n ? -scaled : scaled).toString(),
    scale,
    sign,
  });
}

export function isSha256Hex(value: string): value is Sha256Hex {
  return SHA256.test(value);
}

export function createSha256Hex(value: string): Sha256Hex {
  if (!isSha256Hex(value)) throw new Error("INVALID_SHA256_DIGEST");
  return value as Sha256Hex;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
