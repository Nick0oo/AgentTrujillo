# Eve Tool Authoring Template

Use the complete section contract in [`task.md`](task.md) and add these mandatory tool details to the actual leaf:

- exact `agent/tools/<snake_case>.ts` identity;
- `defineTool` import and installed Eve guide;
- Zod input and output schemas;
- explicit absence of `child_id`, `care_space_id`, `guardian_id`, roles, permissions, authoritative country, and entitlement claims from model input;
- trusted `AuthorizedChildScope` resolution from runtime context;
- required permission;
- effect classification: `read`, `propose`, `write`, or `workflow`;
- Eve approval policy and user confirmation payload;
- idempotency-key source and replay behavior;
- domain-service method signature;
- tables, RPCs, Storage, or workflow used;
- JSON-serializable result and safe `toModelOutput` projection;
- presenter/widget mapping;
- audit record and redaction fields;
- cancellation, stale approval, retry, and duplicate behavior;
- unit, integration, Eve eval, prompt-injection, and cross-child cases.

The executor rechecks authorization even when approval has already passed. Approval is not authorization, and approval alone is not idempotency.
