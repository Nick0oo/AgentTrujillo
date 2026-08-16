# Session route ownership verification

AT-02-16 defines a transport-neutral guard for create, follow-up, stream, cancel, resume, and inspect. Every path authenticates first, verifies the signed child context, resolves the opaque product session through the owner-scoped repository, and performs fresh lease validation before returning trusted data.

The scenario fixture executes 72 cases: six authorized cases, 48 owner-state denials (missing, revoked, expired, stale version, wrong permission, terminal, malformed identifier, and dependency failure), and 18 sibling/co-guardian/foreign-space denials. The guard tests prove zero downstream calls after each failure boundary, universal `404 ACCESS_DENIED` serialization with `no-store`, and stream monitor-before-attach ordering.

The stream monitor performs an immediate validation and serializes periodic checks at a maximum 15 seconds. A denial or validator error aborts once, removes the timer/listener, and exposes no reason or target identifier. The monitor is intentionally transport-neutral; Eve channel adapters attach only after the guard returns a trusted session and active monitor.
