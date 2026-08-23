import type { ChildCountry, ChildPermission } from "../access/authorized-child-scope";
import type { Capability } from "../../../src/commerce/catalog";
import {
  getTrustedToolEntitlements,
  requireActiveChildScope,
  type TrustedToolContext,
} from "./trusted-tool-context";

export type ToolPermission = ChildPermission;
export type ToolCapability = Capability;

export const REGISTERED_TOOL_IDS = Object.freeze([
  "evaluate_vaccination_schedule",
  "get_growth_summary",
  "suggest_pediatric_nutrition",
  "validate_declared_pediatric_dose",
  "register_anthropometry",
  "record_vaccine_administration",
  "create_medication_plan",
  "record_medication_intake",
  "record_development_observation",
  "capture_clinical_memory_candidate",
  "search_child_clinical_memory",
  "prepare_private_document_upload",
  "generate_vaccination_card",
] as const);

export type RegisteredToolId = typeof REGISTERED_TOOL_IDS[number];
export type ToolPermissionPolicy = Readonly<{
  permission: ToolPermission;
  capability: ToolCapability;
  countries: readonly ChildCountry[];
}>;

const CO_ONLY = Object.freeze(["CO"] as const);
const POLICY_DEFINITIONS = {
  evaluate_vaccination_schedule: { permission: "read", capability: "advanced_ai", countries: CO_ONLY },
  get_growth_summary: { permission: "read", capability: "advanced_ai", countries: CO_ONLY },
  suggest_pediatric_nutrition: { permission: "read", capability: "advanced_ai", countries: CO_ONLY },
  validate_declared_pediatric_dose: {
    permission: "manage_medication", capability: "advanced_ai", countries: CO_ONLY,
  },
  register_anthropometry: { permission: "record", capability: "advanced_ai", countries: CO_ONLY },
  record_vaccine_administration: { permission: "record", capability: "advanced_ai", countries: CO_ONLY },
  create_medication_plan: {
    permission: "manage_medication", capability: "advanced_ai", countries: CO_ONLY,
  },
  record_medication_intake: {
    permission: "manage_medication", capability: "advanced_ai", countries: CO_ONLY,
  },
  record_development_observation: { permission: "record", capability: "advanced_ai", countries: CO_ONLY },
  capture_clinical_memory_candidate: { permission: "record", capability: "advanced_ai", countries: CO_ONLY },
  search_child_clinical_memory: { permission: "read", capability: "advanced_ai", countries: CO_ONLY },
  prepare_private_document_upload: {
    permission: "manage_documents", capability: "advanced_ai", countries: CO_ONLY,
  },
  generate_vaccination_card: { permission: "manage_documents", capability: "reports", countries: CO_ONLY },
} as const satisfies Record<RegisteredToolId, ToolPermissionPolicy>;

function freezePolicyRegistry<T extends Record<RegisteredToolId, ToolPermissionPolicy>>(
  definitions: T,
): Readonly<T> {
  for (const policy of Object.values(definitions)) Object.freeze(policy);
  return Object.freeze(definitions);
}

export const TOOL_PERMISSION_POLICY = freezePolicyRegistry(POLICY_DEFINITIONS);

export type ToolPolicyDecision =
  | Readonly<{
    allowed: true;
    policyVersion: "tool-permission.v1";
    toolId: RegisteredToolId;
    permission: ToolPermission;
    capability: ToolCapability;
    country: ChildCountry;
    entitlementRevision: string;
  }>
  | Readonly<{
    allowed: false;
    policyVersion: "tool-permission.v1";
    code: "TOOL_INVOCATION_DENIED";
  }>;

const DENIED: ToolPolicyDecision = Object.freeze({
  allowed: false,
  policyVersion: "tool-permission.v1",
  code: "TOOL_INVOCATION_DENIED",
});
const REGISTERED = new Set<string>(REGISTERED_TOOL_IDS);

export function authorizeToolInvocation(
  context: TrustedToolContext,
  toolId: string,
  now = new Date(),
): ToolPolicyDecision {
  let scope;
  try {
    scope = requireActiveChildScope(context, now);
  } catch {
    return DENIED;
  }
  if (typeof toolId !== "string" || !REGISTERED.has(toolId)) return DENIED;
  const registeredToolId = toolId as RegisteredToolId;
  const policy = TOOL_PERMISSION_POLICY[registeredToolId];
  const entitlements = getTrustedToolEntitlements(context);
  if (!scope.permissions.includes(policy.permission)
    || !policy.countries.some((country) => country === scope.countryOfCare)
    || !entitlements.capabilities.includes(policy.capability)) return DENIED;

  return Object.freeze({
    allowed: true,
    policyVersion: "tool-permission.v1",
    toolId: registeredToolId,
    permission: policy.permission,
    capability: policy.capability,
    country: scope.countryOfCare,
    entitlementRevision: entitlements.revision,
  });
}
