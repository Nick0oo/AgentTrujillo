# Module 07 — Medication and Adherence Verification

## Scope

This evidence file covers the implementation on `codex/roadmap-module-07-medication`. The project target is Supabase Cloud `CreciendoApp` (`yapjiinrjsrothzgzxsv`). The user explicitly selected Cloud-only verification for this module: no local Supabase instance, local reset, or local SQL test runner.

## Implemented boundary

- Caregiver-declared plans, versioned supersession, bounded schedules, factual intakes, corrections, and neutral adherence counts are separate from resolved/computed medication evidence.
- The clinical core resolves exact jurisdiction-specific identities/presentations, requires an approved exact package, uses exact decimal arithmetic, and maps only to `within_reference_limits`, `outside_reference_limits`, `insufficient_data`, or `requires_professional_review`.
- No fixture activates a pediatric dose range. Colombia and United States packages remain blocked pending Dr. Trujillo's exact package/rules/algorithm/source/checksum approval.
- RPC writes derive the actor from `auth.uid()`, require child permission, use fixed `search_path`, and bind idempotency to care space, child, actor, operation kind, and key.

## Cloud commands

Cloud evidence completed against the linked production project:

```powershell
npx supabase db push --linked --yes              # passed; migrations through 20260817170000 applied
npx supabase db lint --linked                   # passed; one pre-existing warning in Module 06
npx supabase migration list --linked            # passed; local and remote match
```

The three pgTAP SQL files were submitted to Cloud but cannot execute because the project does not expose the `plan(integer)` pgTAP function. No local SQL runner was used. The medication eval remains a CI check because this module is Cloud-only by user instruction.

## Clinical gate

The technical module is fail-closed. Clinical leaves that require approval remain blocked; this evidence does not claim numeric pediatric correctness or production activation.
