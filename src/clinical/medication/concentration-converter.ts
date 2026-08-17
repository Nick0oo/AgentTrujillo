import { decimalToCanonicalString, parseExactDecimal } from "./decimal.ts";
import type { MedicationPresentation, MedicationUnit } from "./types.ts";

type ConversionIngredient = Readonly<{ ingredientCode: string; amount: string; unit: MedicationUnit }>;

export type MedicationConcentrationConversion = Readonly<{
  status: "converted" | "insufficient_data" | "requires_professional_review";
  ingredients: readonly ConversionIngredient[];
  explanationCodes: readonly string[];
  arithmetic: readonly Readonly<Record<string, string>>[];
}>;

const MASS_FACTORS: Readonly<Record<string, string>> = { mcg: "0.001", mg: "1", g: "1000" };

function sameOrConvertMass(value: string, from: MedicationUnit, to: MedicationUnit): string | null {
  const fromFactor = MASS_FACTORS[from];
  const toFactor = MASS_FACTORS[to];
  if (!fromFactor || !toFactor) return from === to ? decimalToCanonicalString(parseExactDecimal(value)) : null;
  const decimal = parseExactDecimal(value).value.mul(parseExactDecimal(fromFactor).value).div(parseExactDecimal(toFactor).value);
  return decimal.toFixed();
}

export function convertMedicationConcentration(input: Readonly<{
  presentation: MedicationPresentation;
  quantity: string;
  quantityUnit: MedicationUnit;
}>): MedicationConcentrationConversion {
  if (!input.presentation.concentration) return { status: "requires_professional_review", ingredients: [], explanationCodes: ["CONCENTRATION_OR_RECONSTITUTION_UNAVAILABLE"], arithmetic: [] };
  const concentration = input.presentation.concentration;
  const quantity = parseExactDecimal(input.quantity, { strictlyPositive: true });
  if (input.quantityUnit !== concentration.denominatorUnit) return { status: "insufficient_data", ingredients: [], explanationCodes: ["DECLARED_UNIT_DOES_NOT_MATCH_PRESENTATION"], arithmetic: [] };
  if (input.presentation.ingredients.length === 0) return { status: "insufficient_data", ingredients: [], explanationCodes: ["INGREDIENT_VECTOR_UNAVAILABLE"], arithmetic: [] };
  if (input.presentation.ingredients.length > 1 && input.presentation.ingredients.some((ingredient) => !ingredient.amount || !ingredient.amountUnit)) {
    return { status: "requires_professional_review", ingredients: [], explanationCodes: ["COMBINATION_INGREDIENT_VECTOR_INCOMPLETE"], arithmetic: [] };
  }
  const arithmetic = [{ quantity: decimalToCanonicalString(quantity), denominator: decimalToCanonicalString(parseExactDecimal(concentration.denominator)), numerator: decimalToCanonicalString(parseExactDecimal(concentration.numerator)) }];
  const baseAmount = quantity.value.mul(parseExactDecimal(concentration.numerator).value).div(parseExactDecimal(concentration.denominator).value);
  const ingredients = input.presentation.ingredients.map((ingredient) => {
    if (input.presentation.ingredients.length === 1) return { ingredientCode: ingredient.ingredientCode, amount: baseAmount.toFixed(), unit: concentration.numeratorUnit };
    const amount = sameOrConvertMass(ingredient.amount!, ingredient.amountUnit!, concentration.numeratorUnit);
    if (amount === null) throw new Error("COMBINATION_UNIT_DIMENSION_MISMATCH");
    return { ingredientCode: ingredient.ingredientCode, amount: quantity.value.mul(parseExactDecimal(amount).value).toFixed(), unit: concentration.numeratorUnit };
  });
  return { status: "converted", ingredients, explanationCodes: ["EXACT_CONCENTRATION_CONVERSION"], arithmetic };
}

export type ConcentrationConversionInput = Readonly<{ presentation: MedicationPresentation; quantity: string; quantityUnit: MedicationUnit }>;
export type IngredientAmount = ConversionIngredient;
export type ConversionStep = Readonly<Record<string, string>>;
export type ConcentrationConversion = MedicationConcentrationConversion;
export const convertDeclaredAmount = convertMedicationConcentration;
