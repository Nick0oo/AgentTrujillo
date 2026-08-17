export type GestationalAge = Readonly<{ weeks: number; days: number }>;

export type PrematurityPolicy = Readonly<{
  policyId: string;
  version: string;
  approved: boolean;
  termGestationalWeeks: number;
  correctionEndDays: number;
  eligibleBelowWeeks: number;
  negativeBehavior: "unavailable" | "zero";
}>;

export const NO_APPROVED_PREMATURITY_POLICY: PrematurityPolicy | null = null;
