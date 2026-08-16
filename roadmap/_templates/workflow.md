# Durable Workflow Authoring Template

Use the complete section contract in [`task.md`](task.md) and add these mandatory workflow details to the actual leaf:

- exact trigger and trusted caller;
- durable workflow and step identifiers;
- typed input/output and status state machine;
- idempotency key at trigger, workflow, step, and side-effect boundaries;
- transient versus permanent failure classification;
- retry limits, backoff, timeout, cancellation, and operator replay;
- database status and audit projection;
- schedule configuration and app principal when scheduled;
- duplicate/out-of-order event behavior;
- privacy-safe observability;
- local and hosted verification;
- proof that urgent clinical decisions never enter the workflow.

Workflows orchestrate re-playable background work. They do not create new clinical authority, bypass RLS, or turn model output into confirmed facts.
