# Deterministic Clinical Engine Authoring Template

Use the complete section contract in [`task.md`](task.md) and add these mandatory clinical details to the actual leaf:

- domain input and output types with no model-generated authority fields;
- pure function signatures and numeric/date/unit semantics;
- exact authoritative sources, jurisdiction, license, version, and effective dates;
- rule-pack and algorithm identifiers;
- artifact path and SHA-256 verification;
- Dr. Trujillo approval requirement and activation boundary;
- deterministic positive, negative, boundary, missing-rule, and conflicting-source fixtures;
- reproducibility expectation across process restarts and model providers;
- conservative `RULE_UNAVAILABLE`, professional-review, or abstention behavior;
- persistence projection separated from source facts;
- explicit prohibition on diagnosis, prescription, or model calculation.

Clinical engine leaves use `clinical_risk: high` or `critical`. A package may be technically implemented while production activation remains blocked on approval evidence.
