# Module 03 — Clinical Governance

This module defines the evidence chain that makes a clinical package usable by Agent Trujillo. A database status, uploaded document, model assertion, or operator instruction is never sufficient: source provenance, canonical artifact bytes, checksums, algorithm identity, jurisdiction, effective dates, and Dr. Trujillo's approval must agree.

## Entry gate

- Module `02` is documented and its future implementation exit gate has passed.
- The existing `clinical_sources`, `clinical_rule_packs`, `clinical_rule_pack_sources`, `clinical_approvals`, and `clinical_algorithms` tables are the starting point, not assumed proof of approval.
- The private `clinical-sources` Storage bucket exists and remains server/operator-only.
- Colombia is the first release jurisdiction; United States support is mandatory but activates independently.
- Only primary authorities are accepted for normative rules: Colombia Minsalud/PAI and applicable national authorities, CDC/ACIP for the United States, and WHO when the package explicitly uses a global standard.

## Exit gate

All eleven leaves are complete and fresh evidence proves:

- every source has immutable provenance, retrieval time, jurisdiction, effective window, license/usage metadata, and artifact digest;
- every rule pack is canonical JSON validated against a versioned schema and contains no executable code;
- artifact and implementation hashes are recomputed from bytes, never trusted from metadata;
- algorithms are registered by stable key, semantic version, implementation hash, supported schema, and deterministic test vector;
- resolver output requires an active pack, matching artifact, active compatible algorithm, linked approved sources, and non-withdrawn approval for the same hash;
- jurisdiction and effective-date selection cannot merge Colombia and United States rules or silently fall back across countries;
- Dr. Trujillo approves a specific package hash and clinical meaning, without becoming a chat operator or receiving cases;
- clinical artifacts are private, content-addressed, malware-scanned, size-limited, and downloaded only from allowlisted bucket paths;
- release and rollback are append-only, two-step, auditable operations with preview evidence and an explicit previous known-good version;
- missing, stale, corrupt, ambiguous, unapproved, withdrawn, or jurisdiction-incompatible packages return `RULE_UNAVAILABLE` and never invoke the model to compensate.

## Canonical governance result

```ts
type ResolvedClinicalPackage<T> = Readonly<{
  packId: string;
  domain: ClinicalDomain;
  countryCode: "CO" | "US" | "GLOBAL";
  locale: string;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  artifactSha256: Sha256Hex;
  algorithm: AlgorithmIdentity;
  approval: ApprovalAttestation;
  sources: readonly ClinicalSourceReference[];
  payload: Readonly<T>;
}>;
```

Consumers receive this branded result or `RuleUnavailable`; they cannot construct a resolved package from database rows themselves.

## Dependency graph

```text
AT-02-16 -> AT-03-01 -> AT-03-02 -+-> AT-03-03 -> AT-03-08 -+
                                    |                         |
                                    +-> AT-03-04 -------------+-> AT-03-07 -> AT-03-05
                                                                                 |
                                                                                 v
AT-03-11 <- AT-03-10 <- AT-03-09 <- AT-03-06 <---------------------------------+
```

`AT-03-03` and `AT-03-04` are the only approved parallel pair. Their paths do not overlap; both must finish before the approval and resolver chain proceeds.

## Work-unit index

| ID | Outcome | Database | Clinical approval | Depends on |
|---|---|---:|---:|---|
| [AT-03-01](01-clinical-source-contract.md) | Define primary-source provenance | no | no | `AT-02-16` |
| [AT-03-02](02-rule-pack-artifact-format.md) | Define canonical non-executable artifacts | no | no | `AT-03-01` |
| [AT-03-03](03-rule-pack-checksum-verifier.md) | Verify canonical bytes and digest | no | no | `AT-03-02` |
| [AT-03-04](04-algorithm-registry.md) | Register deterministic algorithms | yes | no | `AT-03-02` |
| [AT-03-05](05-active-pack-resolver.md) | Resolve only fully approved packages | no | no | `AT-03-07`, `AT-03-08`, `AT-03-04` |
| [AT-03-06](06-jurisdiction-and-effective-date-selection.md) | Select exact country/date without mixing | no | no | `AT-03-05` |
| [AT-03-07](07-dr-trujillo-approval-gate.md) | Bind approval to exact artifact hash | yes | yes | `AT-03-03`, `AT-03-04`, `AT-03-08` |
| [AT-03-08](08-clinical-package-storage.md) | Store artifacts privately by digest | no | no | `AT-03-03` |
| [AT-03-09](09-clinical-package-release-workflow.md) | Promote packages through audited release | yes | yes | `AT-03-06` |
| [AT-03-10](10-clinical-package-rollback.md) | Roll back to a verified known-good package | no | yes | `AT-03-09` |
| [AT-03-11](11-clinical-governance-evals.md) | Prove governance cannot be bypassed | no | no | `AT-03-10` |

## Database migration ownership

- `AT-03-04` owns `20260816070000_clinical_algorithm_registry.sql`.
- `AT-03-07` owns `20260816080000_clinical_approval_attestations.sql`.
- `AT-03-09` owns `20260816090000_clinical_package_releases.sql`.

Applied 2026-08-14 migrations are read-only references. Each new migration regenerates types and reruns the full negative RLS suite.

## Clinical boundary

Governance proves provenance and deterministic eligibility; it does not make Agent Trujillo a physician. Packages may support educational guidance, calculations, or safety classification only within the downstream module's policy. They never authorize diagnosis, prescription, medicine selection, treatment, or professional workflow. An emergency package can only support a direct emergency-department recommendation with no alarm, notification, phone, call, map, location, booking, appointment, clinician contact, or home-treatment instruction.

## Module verification

```powershell
npm test -- tests/clinical/governance
npm run eval -- clinical-governance
npx supabase test db --local
npm run verify:database-types
npm run typecheck
npm run build
```

Evidence uses synthetic package IDs and digests. Source files, approval notes, credentials, signed URLs, child data, prompts, and clinical content are not copied into logs.

## Handoff

Modules `04` through `09` may import `ClinicalPackageResolver` and governance value objects only. They may not query governance tables, read Storage artifacts, choose countries, interpret package status, or weaken `RULE_UNAVAILABLE` behavior independently.
