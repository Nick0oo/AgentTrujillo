# Approved tool effect matrix

The matrix is a contract for future typed adapters. It does not authorize a tool by itself.

| Tool slug | Domain service | Effect | Confirmation | Idempotency source | Required permission | Safe result class | Owning roadmap leaf |
|---|---|---|---|---|---|---|---|
| `register_anthropometry` | anthropometry service | write | required payload confirmation | request idempotency key | record | persisted measurement or recoverable error | M10 anthropometry |
| `evaluate_vaccination_schedule` | immunization service | read | none | request ID | read | versioned schedule projection | M10 vaccination |
| `suggest_pediatric_nutrition` | nutrition service | read | none | request ID | read | bounded guidance or abstention | M10 nutrition |
| `validate_declared_pediatric_dose` | medication service | read | none | request ID | read | typed validation state or professional review | M10 medication |
| `capture_clinical_memory_candidate` | memory service | propose | data-dependent confirmation | candidate idempotency key | record | unconfirmed candidate | M10 memory |
| `evaluate_red_flags` | deterministic safety service | read | none | request ID | authenticated session | pre-model safety result | M04 red flags |
| `get_growth_summary` | anthropometry service | read | none | request ID | read | versioned growth projection | M10 growth |
| `record_vaccine_administration` | immunization service | write | required payload confirmation | administration idempotency key | record | persisted declaration or recoverable error | M10 vaccination |
| `create_medication_plan` | medication service | write | required payload confirmation | plan idempotency key | record | plan requiring review or recoverable error | M10 medication |
| `record_medication_intake` | medication service | write | explicit guardian gesture | intake idempotency key | record | intake state or recoverable error | M10 medication |
| `record_development_observation` | development service | write | required payload confirmation | observation idempotency key | record | stored observation or recoverable error | M10 development |
| `search_child_clinical_memory` | memory service | read | none | request ID | read | scoped memories with provenance | M10 memory |
| `prepare_private_document_upload` | document service | propose | explicit upload confirmation | ticket idempotency key | upload | expiring upload ticket or denial | M10 documents |
| `generate_vaccination_card` | document workflow | workflow | required payload confirmation | workflow idempotency key | read | job status with provenance | M10 vaccination |
