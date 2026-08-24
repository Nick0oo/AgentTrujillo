import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

import { canonicalize } from "json-canonicalize";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TOOL_DIRECTORY = fileURLToPath(new URL("../../agent/tools", import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith(".") || specifier.startsWith("/"))
        && (!/\.[a-z0-9]+$/iu.test(specifier) || /\.v[0-9]+$/iu.test(specifier))) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
const EXPECTED_TOOLS = Object.freeze([
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
type ToolId = typeof EXPECTED_TOOLS[number];

const SENTINEL_FILES = Object.freeze([
  "agent.ts", "bash.ts", "glob.ts", "grep.ts", "read_file.ts",
  "web_fetch.ts", "web_search.ts", "write_file.ts",
]);
const PROHIBITED_TOOL_NAMES = Object.freeze([
  "evaluate_red_flags", "trigger_red_flag_alert", "bash", "filesystem", "web",
  "agent", "contact_clinician", "notify_clinician", "book_clinician", "schedule_clinician",
  "clinician_contact", "clinician_notify", "clinician_booking", "clinician_handoff", "transfer_clinician",
]);

type ToolMeta = Readonly<{
  permission: "read" | "record" | "manage_medication" | "manage_documents";
  entitlement: "advanced_ai" | "reports";
  effect: "read_only" | "draft" | "mutating";
  approval: "not_required" | "explicit_ui";
}>;

const TOOL_META: Readonly<Record<ToolId, ToolMeta>> = Object.freeze({
  evaluate_vaccination_schedule: { permission: "read", entitlement: "advanced_ai", effect: "read_only", approval: "not_required" },
  get_growth_summary: { permission: "read", entitlement: "advanced_ai", effect: "read_only", approval: "not_required" },
  suggest_pediatric_nutrition: { permission: "read", entitlement: "advanced_ai", effect: "read_only", approval: "not_required" },
  validate_declared_pediatric_dose: { permission: "manage_medication", entitlement: "advanced_ai", effect: "read_only", approval: "not_required" },
  register_anthropometry: { permission: "record", entitlement: "advanced_ai", effect: "mutating", approval: "explicit_ui" },
  record_vaccine_administration: { permission: "record", entitlement: "advanced_ai", effect: "mutating", approval: "explicit_ui" },
  create_medication_plan: { permission: "manage_medication", entitlement: "advanced_ai", effect: "mutating", approval: "explicit_ui" },
  record_medication_intake: { permission: "manage_medication", entitlement: "advanced_ai", effect: "mutating", approval: "explicit_ui" },
  record_development_observation: { permission: "record", entitlement: "advanced_ai", effect: "mutating", approval: "explicit_ui" },
  capture_clinical_memory_candidate: { permission: "record", entitlement: "advanced_ai", effect: "draft", approval: "explicit_ui" },
  search_child_clinical_memory: { permission: "read", entitlement: "advanced_ai", effect: "read_only", approval: "not_required" },
  prepare_private_document_upload: { permission: "manage_documents", entitlement: "advanced_ai", effect: "draft", approval: "explicit_ui" },
  generate_vaccination_card: { permission: "manage_documents", entitlement: "reports", effect: "mutating", approval: "explicit_ui" },
});

const DOMAIN_GATES: Readonly<Record<ToolId, string>> = Object.freeze({
  evaluate_vaccination_schedule: "immunization_package",
  get_growth_summary: "growth_standard",
  suggest_pediatric_nutrition: "nutrition_policy",
  validate_declared_pediatric_dose: "medication_reference",
  register_anthropometry: "anthropometry_capture",
  record_vaccine_administration: "confirmed_vaccine_evidence",
  create_medication_plan: "medication_resolution",
  record_medication_intake: "medication_plan",
  record_development_observation: "caregiver_observation",
  capture_clinical_memory_candidate: "memory_candidate_policy",
  search_child_clinical_memory: "confirmed_memory_scope",
  prepare_private_document_upload: "private_document_policy",
  generate_vaccination_card: "confirmed_immunization_snapshot",
});

const PRESENTERS: Readonly<Record<ToolId, string>> = Object.freeze({
  evaluate_vaccination_schedule: "vaccination_status",
  get_growth_summary: "growth_summary",
  suggest_pediatric_nutrition: "nutrition_guidance",
  validate_declared_pediatric_dose: "dose_validation",
  register_anthropometry: "growth_summary",
  record_vaccine_administration: "vaccination_status",
  create_medication_plan: "medication_schedule_preview",
  record_medication_intake: "tool_state",
  record_development_observation: "development_observation_preview",
  capture_clinical_memory_candidate: "guardian_confirmation",
  search_child_clinical_memory: "source_list",
  prepare_private_document_upload: "tool_state",
  generate_vaccination_card: "tool_state",
});

const WIDGET_CONTRACTS = Object.freeze([
  { kind: "growth_summary", file: "growth-summary.test.ts", version: "growth.summary.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 262_144 },
  { kind: "vaccination_status", file: "vaccination-status.test.ts", version: "vaccination.status.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 262_144 },
  { kind: "medication_schedule_preview", file: "medication-schedule-preview.test.ts", version: "medication.schedule-preview.v1", eventKind: "widget", actionPolicy: "confirmation_only", maxBytes: 262_144 },
  { kind: "development_observation_preview", file: "development-observation.test.ts", version: "development.observation-preview.v1", eventKind: "widget", actionPolicy: "confirmation_only", maxBytes: 65_536 },
  { kind: "nutrition_guidance", file: "nutrition-guidance.test.ts", version: "nutrition.guidance.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 262_144 },
  { kind: "guardian_confirmation", file: "guardian-confirmation.test.ts", version: "guardian.confirmation.v1", eventKind: "widget", actionPolicy: "confirmation_only", maxBytes: 65_536 },
  { kind: "professional_recommendation", file: "professional-recommendation.test.ts", version: "professional.recommendation.v1", eventKind: "safe_text", actionPolicy: "none", maxBytes: 4_096 },
  { kind: "emergency_recommendation", file: "emergency-recommendation.test.ts", version: "emergency.recommendation.v1", eventKind: "terminal_safety", actionPolicy: "none", maxBytes: 2_048 },
  { kind: "source_list", file: "source-list.test.ts", version: "sources.list.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 131_072 },
  { kind: "dose_validation", file: "dose-validation.test.ts", version: "medication.dose-validation.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 65_536 },
  { kind: "tool_state", file: "tool-state.test.ts", version: "tool.state.v1", eventKind: "widget", actionPolicy: "none", maxBytes: 16_384 },
].map((entry) => Object.freeze({ ...entry, modelPolicy: "exclude_payload" as const })));

const EXPECTED_BEHAVIOR_TEST_DIGESTS = Object.freeze({
  "tests/agent/runtime/tool-permission-policy.test.ts": "b638625276fc2fff16fbcd857e46aafa8bb5dea1284ab1443ce3755e350e0880",
  "tests/agent/runtime/tool-approval-policy.test.ts": "e52f8ecddf476bd24a33826cbfefbb8e89dff298f98739914be30113cdf7aaf0",
  "tests/agent/runtime/tool-idempotency.test.ts": "35d01ff9cbb7fb21d10a3a37ddfe7d7658538aa4ff0841787e0af786a007a971",
  "tests/agent/runtime/safe-to-model.test.ts": "a92c39f138132c858a55e9cefe107c50eafef3bfe0457bdd5bd93053ef80543e",
  "tests/safety/preflight.test.ts": "8240dea9bb26a514394afe489d23c0adb1dae482dd99630a428eead7a490ad45",
  "tests/agent/tools/evaluate-vaccination-schedule.test.ts": "f439bc1552864b7b216bafac46a11c27665b2f6c057839a37d47453ea8c9b70d",
  "tests/agent/tools/get-growth-summary.test.ts": "a4a96cc5e2b45dd439aab9e7f720dfb5a07c4f26cba21392b6f43cc291ef765b",
  "tests/agent/tools/suggest-pediatric-nutrition.test.ts": "3bb446585ea33a212dc10503c00b4b4965d474d2e99606434b260ea7e729e3f3",
  "tests/agent/tools/validate-declared-pediatric-dose.test.ts": "7c9065aa62b0d2e20d1238b8c6aa2f412a009f01889e27b0b3003ea1a9b5e34b",
  "tests/agent/tools/register-anthropometry.test.ts": "fb8adcfc4a72d87d6f376cf938f86e2627eafe3fde3e15526a94b339bdfd7839",
  "tests/agent/tools/record-vaccine-administration.test.ts": "be4c11ee8aefe351214050104da55f54f9d4a5ccc802bc1e04d9864bafc2ff22",
  "tests/agent/tools/create-medication-plan.test.ts": "0f8ff02e8de158279f9a33e44e410b84438065d9412365109819e5fd34ab0aca",
  "tests/agent/tools/record-medication-intake.test.ts": "177f3da5c0bfd6e52722f26d636703930d1e81b2a352175266adf7705d2a14ae",
  "tests/agent/tools/record-development-observation.test.ts": "85f50af4b63c4611a12518c6f411efddbb3cb4e1db38438290012e88c62c06e7",
  "tests/agent/tools/capture-clinical-memory-candidate.test.ts": "dd249e9695b388193f5ba4a9047e1ab19add93891dc26307bb8d9972577c3e71",
  "tests/agent/tools/search-child-clinical-memory.test.ts": "c6696cc971decf2771266d4b1bc59cc4028f985292ae928718d9d124a8836484",
  "tests/agent/tools/prepare-private-document-upload.test.ts": "eb6eae85d506a6f09f8467eebd7ea59814958114002d42fcb13377ea3d27ff71",
  "tests/agent/tools/generate-vaccination-card.test.ts": "1195aa33c67467c4360d5cd2417f1bb8ab25f0f6507d56abc0948a7680a44109",
  "tests/presentation/growth-summary.test.ts": "a04ba59e2d4a340cb5cc03e28ced40d0d08438d568c3a7630aef9f04b99b3442",
  "tests/presentation/vaccination-status.test.ts": "251037fd3743fe5f5e7a2f4d2ec45f6752828dff91d21d675255273d1bae31b7",
  "tests/presentation/medication-schedule-preview.test.ts": "112da748eebb68d7fcdc7c0cf3f7b53f1027ae258c5f7cdbab0267d98ebddca4",
  "tests/presentation/development-observation.test.ts": "7c9b3a634df45640e8d2a74fa4b9d0fcab4e4a03495bc4d0567401193dea6a43",
  "tests/presentation/nutrition-guidance.test.ts": "267daecbfb5da7880be7788c838a1ebd3660f3c85d8d2f12a00fdbaca4192c35",
  "tests/presentation/guardian-confirmation.test.ts": "fa5a1ee928c5cb9b07783bd46c46e38fe213ac6f26e3c6c567ebaad4676e4e79",
  "tests/presentation/professional-recommendation.test.ts": "28f12e8cd4452021b0c2264824607600d6da86779cbacfae510cf6d5e99580c6",
  "tests/presentation/emergency-recommendation.test.ts": "d8fc4d9adb6973bb50132d506f77dea5ddfbb8ed6f7d40a9706a64f5c9a9fb74",
  "tests/presentation/source-list.test.ts": "6351788c525583e2d92980bea613986c0e2c3f4786c77f85e6f8e436958f3a68",
  "tests/presentation/dose-validation.test.ts": "18eada3478cd0d1d17f259097bba73c5fbb234004708eea3e778773cdeb0596f",
  "tests/presentation/tool-state.test.ts": "efab6cac71eb3b1c5f3eaf5e148acf5a36d9c7fd665275142f91e81d8606e12e",
  "tests/presentation/widget-registry.test.ts": "c486f56927252dcb79a8d8b9166887d3d7c14ccd20d722e065a75f586ee6e3c3",
} as const);

type AssertionResult = Readonly<{
  status?: string;
  failureMessages?: readonly string[];
}>;
type TestResult = Readonly<{
  name: string;
  status?: string;
  message?: string;
  assertionResults?: readonly AssertionResult[];
}>;
type VitestJson = Readonly<{
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: readonly TestResult[];
}>;
type DiscoveryJson = Readonly<{
  status: string;
  diagnostics: Readonly<{ errors: number; warnings: number }>;
  authoredTools: readonly string[];
  subagents: readonly string[];
  schedules: readonly string[];
}>;
type CheckState = { total: number; failures: string[] };

const LEAKAGE_PATTERNS = Object.freeze([
  ["google_api_key", /AIza[0-9A-Za-z_-]{20,}/u],
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["bearer_token", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/iu],
  ["jwt", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/u],
  ["signed_url", /[?&](?:X-Amz-Signature|X-Goog-Signature|signature|token)=[^&\s]{8,}/iu],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
  ["raw_boundary_field", /["'](?:prompt|reasoning|rawToolPayload|documentContent|signedUrl)["']\s*:/iu],
] as const);

function check(state: CheckState, condition: boolean, code: string): void {
  state.total += 1;
  if (!condition) state.failures.push(code);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function schemaVersion(source: string): string | null {
  return /const TOOL_SCHEMA_VERSION = "([a-z0-9._-]+)" as const;/u.exec(source)?.[1] ?? null;
}

function relativeTestName(name: string): string {
  const normalized = name.replaceAll("\\", "/");
  const marker = normalized.lastIndexOf("/tests/");
  return marker >= 0 ? normalized.slice(marker + 1) : normalized;
}

function findTestResult(report: VitestJson, suffix: string): TestResult {
  const found = report.testResults.find((result) => relativeTestName(result.name).endsWith(suffix));
  if (!found) throw new Error("behavioral_test_missing");
  return found;
}

function runContractTests(): Readonly<{
  report: VitestJson;
  captured: string;
  publicResult: Readonly<{ files: number; tests: number; passed: number; failed: number }>;
}> {
  const vitest = fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    vitest, "run", "tests/agent", "tests/presentation", "tests/safety", "--reporter=json",
  ], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || typeof result.stdout !== "string") throw new Error("contract_test_gate");
  let report: VitestJson;
  try {
    report = JSON.parse(result.stdout) as VitestJson;
  } catch {
    throw new Error("contract_test_report");
  }
  if (!report.success || report.numFailedTests !== 0 || report.numPassedTests !== report.numTotalTests) {
    throw new Error("contract_test_failure");
  }
  return Object.freeze({
    report,
    captured: [
      result.stderr ?? "",
      ...report.testResults.flatMap((testResult) => [
        testResult.message ?? "",
        ...(testResult.assertionResults ?? []).flatMap((assertion) => assertion.failureMessages ?? []),
      ]),
    ].join("\n"),
    publicResult: Object.freeze({
      files: report.testResults.length,
      tests: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
    }),
  });
}

function runDiscoveryGate(): Readonly<{ report: DiscoveryJson; captured: string }> {
  const script = fileURLToPath(new URL("../../scripts/verify-eve-discovery.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 || typeof result.stdout !== "string") throw new Error("discovery_gate");
  let report: DiscoveryJson;
  try {
    report = JSON.parse(result.stdout) as DiscoveryJson;
  } catch {
    throw new Error("discovery_report");
  }
  if (report.status !== "ready"
    || report.diagnostics.errors !== 0
    || report.diagnostics.warnings !== 0
    || sorted(report.authoredTools).join("|") !== sorted(EXPECTED_TOOLS).join("|")
    || report.subagents.length !== 0
    || report.schedules.length !== 0) throw new Error("discovery_surface");
  return Object.freeze({
    report: Object.freeze({
      status: report.status,
      diagnostics: Object.freeze({ ...report.diagnostics }),
      authoredTools: Object.freeze([...report.authoredTools]),
      subagents: Object.freeze([...report.subagents]),
      schedules: Object.freeze([...report.schedules]),
    }),
    captured: `${result.stdout}\n${result.stderr ?? ""}`,
  });
}

function scanCapturedOutput(captured: string): readonly string[] {
  return Object.freeze(LEAKAGE_PATTERNS
    .filter(([, pattern]) => pattern.test(captured))
    .map(([code]) => code));
}

function testEvidence(report: VitestJson, path: keyof typeof EXPECTED_BEHAVIOR_TEST_DIGESTS, checks: CheckState) {
  const result = findTestResult(report, path);
  const assertions = result.assertionResults ?? [];
  const actualDigest = createHash("sha256").update(readFileSync(`${ROOT}/${path}`)).digest("hex");
  const passed = result.status === "passed"
    && assertions.length > 0
    && assertions.every((assertion) => assertion.status === "passed")
    && actualDigest === EXPECTED_BEHAVIOR_TEST_DIGESTS[path];
  check(checks, passed, `behavioral_suite:${path}`);
  return Object.freeze({ path, assertions: assertions.length, sha256: actualDigest, passed });
}

async function executeEvidenceRun() {
  const checks: CheckState = { total: 0, failures: [] };
  const behavioral = runContractTests();
  const discovery = runDiscoveryGate();
  const behaviorTestEvidence = Object.keys(EXPECTED_BEHAVIOR_TEST_DIGESTS).map((path) =>
    testEvidence(behavioral.report, path as keyof typeof EXPECTED_BEHAVIOR_TEST_DIGESTS, checks));
  const evidenceByPath = new Map(behaviorTestEvidence.map((evidence) => [evidence.path, evidence]));

  const [permissionModule, approvalModule, safeOutputModule, widgetModule] = await Promise.all([
    import(new URL("../../agent/lib/runtime/tool-permission-policy.ts", import.meta.url).href),
    import(new URL("../../agent/lib/runtime/tool-approval-policy.ts", import.meta.url).href),
    import(new URL("../../agent/lib/runtime/safe-to-model.ts", import.meta.url).href),
    import(new URL("../../src/presentation/widget-registry.ts", import.meta.url).href),
  ]);
  const actualToolIds = [...permissionModule.REGISTERED_TOOL_IDS] as ToolId[];
  check(checks, sorted(actualToolIds).join("|") === sorted(EXPECTED_TOOLS).join("|"), "runtime_tool_ids_exact");
  check(checks, Object.isFrozen(permissionModule.TOOL_PERMISSION_POLICY), "permission_registry_frozen");
  check(checks, Object.isFrozen(approvalModule.TOOL_APPROVAL_REQUIREMENTS), "approval_registry_frozen");
  check(checks, Object.isFrozen(safeOutputModule.TOOL_SAFE_RESULT_SCHEMAS), "safe_output_registry_frozen");

  const toolModules = await Promise.all(actualToolIds.map((toolId) =>
    import(new URL(`../../agent/tools/${toolId}.ts`, import.meta.url).href)));
  const runtimeDescriptors = actualToolIds.map((toolId, index) => {
    const descriptor = toolModules[index]?.default;
    const valid = descriptor !== null
      && typeof descriptor === "object"
      && typeof descriptor.execute === "function"
      && typeof descriptor.toModelOutput === "function"
      && typeof descriptor.inputSchema?.safeParse === "function"
      && typeof descriptor.outputSchema?.safeParse === "function";
    check(checks, valid, `${toolId}:runtime_descriptor`);
    return Object.freeze({ toolId, inputSchema: valid, outputSchema: valid, execute: valid, toModelOutput: valid });
  });

  const toolContracts = actualToolIds.map((toolId) => {
    const source = readFileSync(`${TOOL_DIRECTORY}/${toolId}.ts`, "utf8");
    const version = schemaVersion(source);
    const expected = TOOL_META[toolId];
    const permission = permissionModule.TOOL_PERMISSION_POLICY[toolId];
    const approval = approvalModule.TOOL_APPROVAL_REQUIREMENTS[toolId];
    const safeSchema = safeOutputModule.TOOL_SAFE_RESULT_SCHEMAS[toolId];
    const budget = safeOutputModule.TOOL_MODEL_BUDGETS[toolId];
    check(checks, version !== null, `${toolId}:schema_version`);
    check(checks, permission.permission === expected.permission, `${toolId}:permission`);
    check(checks, permission.capability === expected.entitlement, `${toolId}:entitlement`);
    check(checks, permission.countries.length === 1 && permission.countries[0] === "CO", `${toolId}:country`);
    check(checks, approval.effect === expected.effect, `${toolId}:effect`);
    check(checks, approval.approval === expected.approval, `${toolId}:approval`);
    check(checks, typeof safeSchema?.safeParse === "function", `${toolId}:safe_schema`);
    check(checks, Number.isInteger(budget?.maxBytes) && budget.maxBytes > 0, `${toolId}:model_budget`);
    return Object.freeze({
      toolId,
      schemaVersion: version,
      safeOutputVersion: `${toolId}.model.v1`,
      permission: permission.permission,
      entitlement: permission.capability,
      country: permission.countries[0],
      effect: approval.effect,
      approval: approval.approval,
      idempotency: approval.effect === "read_only" ? "request_fingerprint" : "required",
      domainGate: DOMAIN_GATES[toolId],
      presenter: PRESENTERS[toolId],
    });
  });
  check(checks, sorted(Object.keys(safeOutputModule.TOOL_SAFE_RESULT_SCHEMAS)).join("|")
    === sorted(EXPECTED_TOOLS).join("|"), "safe_schema_keys");
  check(checks, sorted(Object.keys(safeOutputModule.TOOL_MODEL_BUDGETS)).join("|")
    === sorted(EXPECTED_TOOLS).join("|"), "model_budget_keys");
  const toolFiles = sorted(readdirSync(TOOL_DIRECTORY).filter((name) => name.endsWith(".ts")));
  const expectedFiles = sorted([...EXPECTED_TOOLS.map((toolId) => `${toolId}.ts`), ...SENTINEL_FILES]);
  check(checks, toolFiles.join("|") === expectedFiles.join("|"), "tool_files_exact");

  const widgetRegistry = widgetModule.WIDGET_REGISTRY as Readonly<Record<string, Readonly<{
    kind: string;
    version: string;
    schema: Readonly<{ safeParse: unknown }>;
    eventKind: string;
    actionPolicy: string;
    modelPolicy: string;
    maxBytes: number;
    rendererCompatibility: Readonly<{ protocol: string; major: number }>;
    deprecation: Readonly<{ status: string; acceptsUntil: unknown; replacementVersion: unknown }>;
  }>>>;
  check(checks, Object.isFrozen(widgetRegistry), "widget_registry_frozen");
  const widgetContracts = Object.values(widgetRegistry).map((entry) => {
    check(checks, Object.isFrozen(entry), `${entry.kind}:registry_entry_frozen`);
    check(checks, typeof entry.schema?.safeParse === "function", `${entry.kind}:runtime_schema`);
    check(checks, entry.rendererCompatibility.protocol === "creciendo.widget.v1"
      && entry.rendererCompatibility.major === 1, `${entry.kind}:renderer_protocol`);
    check(checks, entry.deprecation.status === "active"
      && entry.deprecation.acceptsUntil === null
      && entry.deprecation.replacementVersion === null, `${entry.kind}:active_version`);
    return Object.freeze({
      kind: entry.kind,
      version: entry.version,
      eventKind: entry.eventKind,
      actionPolicy: entry.actionPolicy,
      maxBytes: entry.maxBytes,
      modelPolicy: entry.modelPolicy,
    });
  }).sort((left, right) => left.kind.localeCompare(right.kind));
  const expectedWidgetContracts = WIDGET_CONTRACTS.map(({ file: _file, ...entry }) => entry)
    .sort((left, right) => left.kind.localeCompare(right.kind));
  check(checks, canonicalize(widgetContracts) === canonicalize(expectedWidgetContracts), "widget_contracts_exact");

  const toolBehaviorSuites = actualToolIds.map((toolId) => {
    const path = `tests/agent/tools/${toolId.replaceAll("_", "-")}.test.ts` as keyof typeof EXPECTED_BEHAVIOR_TEST_DIGESTS;
    const evidence = evidenceByPath.get(path);
    check(checks, evidence?.passed === true, `${toolId}:behavioral_suite`);
    return Object.freeze({ toolId, assertions: evidence?.assertions ?? 0, sha256: evidence?.sha256 ?? null });
  });
  const presenterBehaviorSuites = WIDGET_CONTRACTS.map((widget) => {
    const path = `tests/presentation/${widget.file}` as keyof typeof EXPECTED_BEHAVIOR_TEST_DIGESTS;
    const evidence = evidenceByPath.get(path);
    check(checks, evidence?.passed === true, `${widget.kind}:behavioral_suite`);
    return Object.freeze({ kind: widget.kind, assertions: evidence?.assertions ?? 0, sha256: evidence?.sha256 ?? null });
  });
  const policyOrder = Object.freeze({
    preLlmAccessFirst: evidenceByPath.get("tests/safety/preflight.test.ts")?.passed === true,
    exactPermissionRegistry: evidenceByPath.get("tests/agent/runtime/tool-permission-policy.test.ts")?.passed === true,
    exactApprovalClassification: evidenceByPath.get("tests/agent/runtime/tool-approval-policy.test.ts")?.passed === true,
    approvalBeforeEffect: evidenceByPath.get("tests/agent/runtime/tool-idempotency.test.ts")?.passed === true,
    reauthorizationBeforeReplay: evidenceByPath.get("tests/agent/runtime/tool-idempotency.test.ts")?.passed === true,
    reauthorizationBeforeApprovalConsumption: evidenceByPath.get("tests/agent/runtime/tool-approval-policy.test.ts")?.passed === true,
    exactSafeProjectionRegistry: evidenceByPath.get("tests/agent/runtime/safe-to-model.test.ts")?.passed === true,
    exactWidgetRegistry: evidenceByPath.get("tests/presentation/widget-registry.test.ts")?.passed === true,
    validatedFallback: evidenceByPath.get("tests/presentation/widget-registry.test.ts")?.passed === true,
    deterministicWidgetRegistry: evidenceByPath.get("tests/presentation/widget-registry.test.ts")?.passed === true,
  });
  for (const [name, covered] of Object.entries(policyOrder)) check(checks, covered, `policy:${name}`);

  const prohibitedDiscovered = discovery.report.authoredTools
    .filter((name) => PROHIBITED_TOOL_NAMES.includes(name));
  check(checks, prohibitedDiscovered.length === 0, "prohibited_discovery_surface");
  const runtimeSnapshot = JSON.stringify({ toolContracts, widgetContracts, runtimeDescriptors });
  const leakageCodes = scanCapturedOutput(`${behavioral.captured}\n${discovery.captured}\n${runtimeSnapshot}`);
  for (const code of leakageCodes) checks.failures.push(`leakage:${code}`);
  checks.total += LEAKAGE_PATTERNS.length;

  const criticalFailures = checks.failures.length + behavioral.publicResult.failed;
  return Object.freeze({
    schemaVersion: "tool-contract-eval.v2" as const,
    toolCount: toolContracts.length,
    presenterCount: widgetContracts.length,
    registryCount: 1,
    behavioralChecks: checks.total,
    criticalFailures,
    failureCodes: Object.freeze([...checks.failures]),
    leakageFindings: leakageCodes.length,
    leakageFindingCodes: leakageCodes,
    prohibitedSurfaceFindings: prohibitedDiscovered.length,
    verification: behavioral.publicResult,
    policyOrder,
    behaviorTestEvidence,
    toolBehaviorSuites,
    presenterBehaviorSuites,
    runtimeDescriptors,
    discovery: discovery.report,
    toolContracts,
    widgetContracts,
  });
}

export async function runToolContractsEval() {
  const first = await executeEvidenceRun();
  const second = await executeEvidenceRun();
  const firstDigest = createHash("sha256").update(canonicalize(first), "utf8").digest("hex");
  const secondDigest = createHash("sha256").update(canonicalize(second), "utf8").digest("hex");
  if (firstDigest !== secondDigest) throw new Error("determinism_mismatch");
  return Object.freeze({
    ...first,
    determinism: Object.freeze({ runs: 2, matched: true }),
    digestSha256: firstDigest,
  });
}

function boundedFailureCode(error: unknown): string {
  if (!(error instanceof Error) || !/^[a-z][a-z0-9_:-]{0,63}$/u.test(error.message)) return "unknown_failure";
  return error.message;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requested = process.argv[2] ?? "tool-contracts";
  try {
    const report = requested === "tool-contracts"
      ? await runToolContractsEval()
      : requested === "channel-streaming"
        ? await (await import("./channel-streaming.eval.ts")).runChannelStreamingEval()
        : (() => { throw new Error("unknown_eval"); })();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.criticalFailures !== 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${requested} eval failed: ${boundedFailureCode(error)}\n`);
    process.exitCode = 1;
  }
}
