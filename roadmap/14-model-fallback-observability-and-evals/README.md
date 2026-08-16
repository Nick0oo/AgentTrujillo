# Module 14 — Model Fallback, Observability, and Evals

This module keeps direct Gemini as primary, adds a disabled-by-default OpenRouter adapter, permits at most one evaluated pre-stream failover, redacts all operational telemetry, and builds the global evidence gate.

## Entry gate

- Modules 01–13 implementation/eval contracts are available for the candidate release.
- OpenRouter uses the official Vercel AI SDK provider package and exact released model/routing options; no arbitrary auto model routing.
- Fallback is disabled until a signed parity artifact has zero critical safety, isolation, authorization, tool, streaming, and privacy failures.
- Observability schemas exclude PHI, prompts, reasoning, raw tool/document/provider/billing data, secrets, signed URLs, and vectors before any exporter.

## Exit gate

All twenty leaves prove phase-aware failure classification, pre-stream-only failover, no mid-stream replay, bounded circuits/tokens/latency/cost, explicit technical abstention, privacy-minimal structured telemetry, OpenTelemetry redaction, hardened Eve/Vercel run visibility, exhaustive global eval suites, CI/JUnit thresholds, and a checksummed release evidence bundle.

## Dependency strategy

Model policy leaves 01–09 are sequential. Observability 10–12 is a separate chain. Eval suites 13–18 run in parallel after both chains and their domain gates. CI aggregation 19 and signed evidence bundle 20 are sequential release gates.

## Work-unit index

| ID | Work unit | Kind |
|---|---|---|
| [AT-14-01](01-model-policy-types.md) | model policy types | model routing |
| [AT-14-02](02-openrouter-provider-adapter.md) | openrouter provider adapter | model routing |
| [AT-14-03](03-provider-failure-classification.md) | provider failure classification | model routing |
| [AT-14-04](04-pre-stream-failover-adapter.md) | pre stream failover adapter | model routing |
| [AT-14-05](05-no-mid-stream-replay-policy.md) | no mid stream replay policy | model routing |
| [AT-14-06](06-provider-circuit-breaker.md) | provider circuit breaker | model routing |
| [AT-14-07](07-token-latency-and-cost-budgets.md) | token latency and cost budgets | model routing |
| [AT-14-08](08-gemini-openrouter-parity-gate.md) | gemini openrouter parity gate | model routing |
| [AT-14-09](09-provider-abstention-path.md) | provider abstention path | model routing |
| [AT-14-10](10-observability-event-schema.md) | observability event schema | observability |
| [AT-14-11](11-otel-redaction-policy.md) | otel redaction policy | observability |
| [AT-14-12](12-agent-runs-privacy-review.md) | agent runs privacy review | observability |
| [AT-14-13](13-clinical-safety-eval-suite.md) | clinical safety eval suite | eval |
| [AT-14-14](14-cross-child-isolation-eval-suite.md) | cross child isolation eval suite | eval |
| [AT-14-15](15-prompt-injection-eval-suite.md) | prompt injection eval suite | eval |
| [AT-14-16](16-tool-misuse-eval-suite.md) | tool misuse eval suite | eval |
| [AT-14-17](17-streaming-recovery-eval-suite.md) | streaming recovery eval suite | eval |
| [AT-14-18](18-telemetry-privacy-eval-suite.md) | telemetry privacy eval suite | eval |
| [AT-14-19](19-eval-ci-and-junit.md) | eval ci and junit | eval |
| [AT-14-20](20-release-evidence-bundle.md) | release evidence bundle | release evidence |

## Provider policy

```text
pre-LLM safety -> authorization/tool policy -> direct Gemini attempt
  -> eligible transient failure before any commit?
       no: safe failure/terminal handling
       yes: exact released OpenRouter candidate, once
  -> first persisted/user-visible/tool-effect event locks provider
  -> any later failure terminates; never replay through another model
```

OpenRouter routing requires the evaluated model/provider options, parameter support, data-collection denial and ZDR constraints captured by the release artifact. Provider refusal or safety abstention is not an outage to bypass.

## Observability policy

Structured categorical events and OpenTelemetry spans are redacted locally before console, Vercel logs, drains, or vendors. Eve/Workflow/operator surfaces receive explicit retention/access review. Synthetic canaries prove sensitive values cannot escape through nested attributes, exception stacks, debug modes, eval reports, or provider metadata.

## Module verification

```powershell
npm test -- tests/models tests/observability tests/security tests/release
npm run eval -- all
npm run eval:ci -- --reporter=junit
npm run typecheck
npm run build
npx eve info
```

## Handoff

Module 15 consumes the signed evidence bundle for preview, controlled Colombia rollout, US activation gating, backup/restore, cutover, and rollback.
