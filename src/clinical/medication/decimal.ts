import Decimal from "decimal.js";

const EXACT_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export type ExactDecimal = Readonly<{ value: Decimal; lexeme: string }>;

export function parseExactDecimal(
  lexeme: string,
  options: Readonly<{ strictlyPositive?: boolean }> = {},
): ExactDecimal {
  if (!EXACT_DECIMAL.test(lexeme)) throw new Error("INVALID_EXACT_DECIMAL");
  const value = new Decimal(lexeme);
  if (!value.isFinite()) throw new Error("INVALID_EXACT_DECIMAL");
  if (options.strictlyPositive === true && !value.gt(0)) throw new Error("NON_POSITIVE_DECIMAL");
  return Object.freeze({ value, lexeme });
}

export function decimalToCanonicalString(value: ExactDecimal | Decimal): string {
  return ("value" in value ? value.value : value).toFixed();
}

export function compareExactDecimals(left: ExactDecimal | Decimal, right: ExactDecimal | Decimal): -1 | 0 | 1 {
  const leftValue = "value" in left ? left.value : left;
  const rightValue = "value" in right ? right.value : right;
  return leftValue.comparedTo(rightValue) as -1 | 0 | 1;
}

export function multiplyExactDecimals(left: ExactDecimal | Decimal, right: ExactDecimal | Decimal): ExactDecimal {
  const leftValue = "value" in left ? left.value : left;
  const rightValue = "value" in right ? right.value : right;
  return Object.freeze({ value: leftValue.mul(rightValue), lexeme: leftValue.mul(rightValue).toFixed() });
}

export function divideExactDecimals(left: ExactDecimal | Decimal, right: ExactDecimal | Decimal): ExactDecimal {
  const leftValue = "value" in left ? left.value : left;
  const rightValue = "value" in right ? right.value : right;
  if (rightValue.isZero()) throw new Error("DIVISION_BY_ZERO");
  const result = leftValue.div(rightValue);
  return Object.freeze({ value: result, lexeme: result.toFixed() });
}
