import type { CountryCode, Sha256Hex } from "../governance/source-types.ts";

export type ImmunizationCountry = Exclude<CountryCode, "GLOBAL">;
export type ImmunizationStatus = "applied" | "upcoming" | "due" | "overdue" | "not_applicable" | "review_required";
export type VaccinationStatus = ImmunizationStatus;
export type DoseScheduleStatus = ImmunizationStatus;
export type ImmunizationRuleKind = "routine" | "catch_up" | "special_population" | "campaign" | "outbreak" | "review_only";
export type CalendarIntervalUnit = "days" | "calendar_months" | "calendar_years";
export type CalendarDate = string & { readonly __calendarDate: unique symbol };
export type VaccineProductId = string & { readonly __vaccineProductId: unique symbol };
export type AntigenId = string & { readonly __antigenId: unique symbol };
export type ImmunizationRuleId = string & { readonly __immunizationRuleId: unique symbol };
export type AdministrationId = string & { readonly __administrationId: unique symbol };
export type AssessmentId = string & { readonly __immunizationAssessmentId: unique symbol };

export type CalendarInterval = Readonly<{
  unit: CalendarIntervalUnit;
  value: number;
}>;

export type VaccineProductQuery = Readonly<{
  regulatoryIdentifier?: string;
  productCode?: string;
  alias?: string;
}>;

export type VaccineProductIdentity = Readonly<{
  id: VaccineProductId;
  productCode: string;
  countryCode: ImmunizationCountry | "GLOBAL";
  manufacturer: string;
  brandName: string;
  presentation: string;
  regulatoryIdentifier: string | null;
  aliases: readonly string[];
  effectiveFrom: CalendarDate;
  effectiveUntil: CalendarDate | null;
  active: boolean;
}>;

export type AntigenIdentity = Readonly<{
  id: AntigenId;
  antigenCode: string;
  displayName: string;
  diseaseGroup: string;
  active: boolean;
}>;

export type VaccineCatalog = Readonly<{
  version: string;
  sourceDigest: Sha256Hex;
  products: readonly VaccineProductIdentity[];
  antigens: readonly AntigenIdentity[];
  productAntigens: readonly Readonly<{ productId: VaccineProductId; antigenId: AntigenId }>[];
}>;

export type VaccineAdministrationCommand = Readonly<{
  administeredOn: CalendarDate;
  product: VaccineProductQuery;
  antigenCodes?: readonly string[];
  doseLabel?: string;
  lotNumber?: string;
  administrationSite?: string;
  providerName?: string;
  provenanceType: "guardian" | "professional" | "import" | "document" | "chat";
}>;

export type AdministrationScope = Readonly<{
  careSpaceId: string;
  childId: string;
  countryCode: ImmunizationCountry;
  asOfDate: CalendarDate;
}>;

export type VaccineEvidence = Readonly<{
  sourceType: "guardian" | "professional" | "import" | "document" | "chat";
  sourceId: string;
  sourceDigest: Sha256Hex;
  extractedAt: string;
  observedScope: Readonly<{ childId?: string; countryCode?: ImmunizationCountry }>;
  expiresAt: string | null;
}>;

export type AdministrationDraft = Readonly<{
  draftId: string;
  scope: AdministrationScope;
  evidence: VaccineEvidence;
  extracted: VaccineAdministrationCommand;
  confirmationDigest: Sha256Hex;
  expiresAt: string | null;
}>;

export type ConfirmedAdministration = Readonly<{
  id: AdministrationId;
  scope: AdministrationScope;
  administeredOn: CalendarDate;
  product: VaccineProductIdentity | null;
  antigenIds: readonly AntigenId[];
  doseLabel: string | null;
  provenanceType: VaccineEvidence["sourceType"];
  sourceDigest: Sha256Hex;
  confirmationDigest: Sha256Hex;
  confirmedAt: string;
  supersedesId: AdministrationId | null;
}>;

export type ImmunizationRule = Readonly<{
  id: ImmunizationRuleId;
  code: string;
  countryCode: ImmunizationCountry;
  kind: ImmunizationRuleKind;
  seriesCode: string;
  doseCode: string;
  doseNumber: number;
  antigenId: AntigenId;
  minimumAge: CalendarInterval | null;
  targetAge: CalendarInterval | null;
  targetAgeUntil: CalendarInterval | null;
  minimumInterval: CalendarInterval | null;
  recommendedInterval: CalendarInterval | null;
  catchUp: boolean;
  eligibilityCriteria: Readonly<Record<string, unknown>>;
  contraindicationReviewRequired: boolean;
  sourceReferences: readonly string[];
}>;

export type RuleDependencyType = "previous_dose" | "either_or" | "conditional" | "excludes";
export type RuleDependency = Readonly<{
  ruleId: ImmunizationRuleId;
  dependsOnRuleId: ImmunizationRuleId;
  dependencyType: RuleDependencyType;
  minimumInterval: CalendarInterval | null;
}>;

export type DoseValidity = "valid" | "invalid" | "review_required";
export type VaccinationAssessment = Readonly<{
  id: AssessmentId;
  scope: AdministrationScope;
  ruleId: ImmunizationRuleId;
  status: ImmunizationStatus;
  reasonCode: string;
  dueFrom: CalendarDate | null;
  dueUntil: CalendarDate | null;
  evidenceAdministrationIds: readonly AdministrationId[];
  rulePackId: string;
  rulePackVersion: string;
  algorithmId: string;
  sourceDigest: Sha256Hex;
  inputDigest: Sha256Hex;
  decisionDigest: Sha256Hex;
  assessedAt: string;
}>;

export type ProductResolution = Readonly<{
  outcome: "resolved" | "ambiguous" | "unknown" | "retired" | "jurisdiction_mismatch";
  product: VaccineProductIdentity | null;
  candidates: readonly VaccineProductIdentity[];
  reasonCode: string;
  catalogVersion?: string;
  catalogDigest?: Sha256Hex;
  antigenIds?: readonly AntigenId[];
}>;

export type AntigenResolution = Readonly<{
  outcome: "resolved" | "review_required";
  antigenIds: readonly AntigenId[];
  reasonCode: string;
  productId?: VaccineProductId;
  catalogVersion?: string;
  warnings?: readonly string[];
}>;

export type ProductAntigenResolution = AntigenResolution;
export type EvidenceField<T> = Readonly<{
  value: T | null;
  declaredValue: T | null;
  sourceDigest: Sha256Hex;
  sourceReference: string;
  confidence: "declared" | "extracted" | "uncertain";
  alternatives: readonly T[];
  reviewRequired: boolean;
}>;
export type DraftDecision = "draft" | "confirmed" | "rejected" | "superseded";
export type MinimumIntervalEvidence = Readonly<{
  priorAdministrationOn: CalendarDate;
  minimumInterval: CalendarInterval;
  earliestEligibleOn: CalendarDate;
  valid: boolean;
}>;
export type DependencyGraph = Readonly<{
  rules: readonly ImmunizationRule[];
  dependencies: readonly RuleDependency[];
}>;
export type EvidenceAssignment = Readonly<{
  ruleId: ImmunizationRuleId;
  administrationId: AdministrationId;
}>;
export type RuleSatisfaction = Readonly<{
  ruleId: ImmunizationRuleId;
  satisfied: boolean;
  status: "satisfied" | "unsatisfied" | "review_required" | "excluded";
  reasonCode: string;
}>;
