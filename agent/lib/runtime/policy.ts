export const AGENT_RUNTIME_POLICY = Object.freeze({
  reasoning: "medium" as const,
  compaction: Object.freeze({ thresholdPercent: 0.75 }),
  limits: Object.freeze({
    maxInputTokensPerSession: 250_000,
    maxOutputTokensPerSession: 30_000,
  }),
});
