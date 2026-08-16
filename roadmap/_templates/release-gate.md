# Release Gate Authoring Template

Use the complete section contract in [`task.md`](task.md) and add these mandatory gate details to the actual leaf:

- exact prerequisite work-unit IDs and commits;
- zero-tolerance versus thresholded checks;
- clinical, security, privacy, reliability, cost, and latency evidence;
- command list, exit codes, test/eval counts, and artifact paths;
- required human or clinical approval authority;
- environment and jurisdiction;
- activation and disabled-state behavior;
- preview/shadow/canary stages;
- rollback trigger, procedure, and evidence;
- provider, database, workflow, and mobile-client failure behavior;
- explicit statement that failing or missing evidence blocks activation.

A release gate records evidence; it never waives an inherited clinical or isolation invariant.
