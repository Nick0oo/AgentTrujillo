# Growth compatibility correction — 2026-10-29

## Production comparison after native rejection

After the user reported that Android build 9 still failed, a fresh authenticated comparison against the same authorized existing test profile returned HTTP 200 with **one history record and zero evaluated points from production**, versus **seven history records and five points from the corrected local backend**. A newly created profile has zero measurements in both environments. This was repeated with the current account and no writes. The compatibility correction below is still local; production deployment is required to correct the store app's populated history. Approval of the earlier Supabase child-registration migrations did not deploy this backend code.

Fresh host verification during this follow-up: 61 suites / 417 passed tests and one existing skip, followed by the two environment-sensitive import suites / 20 passed tests with valid synthetic configuration: total **63 suites / 437 passed tests, one skip**. TypeScript and backend build pass. The initial Windows sandbox attempt failed Vitest temporary-file renames before collecting tests. No remote deployment was performed.

The user reported that Crecer did not load a child's measurements or save new ones. Existing uncommitted backend diagnostics and mobile corrections were preserved.

## Findings and correction

Read-only catalog inspection of the expected linked project confirmed that the source-note column/RPC and its three local migrations are absent remotely. Unconditionally calling that RPC breaks even commands without notes. Such commands now use the existing atomic `record_confirmed_anthropometry` RPC, retaining guardian authorization, confirmation and scoped idempotency. An explicit note still requires the note RPC; it is never silently discarded.

Aggregate inspection found confirmed historical measurements without the newer input fingerprint or decimal lexeme. The modern confirmed-command repository rejects those rows, and the old history adapter silently skipped them. The channel now reads historical facts separately, with the stored numeric value cast to text in Postgres, preferring a modern exact decimal lexeme where present. No command fingerprint is manufactured. Null methods are presented as `unknown`. Both child and care-space filters, request JWT/RLS, confirmation status, scope expiry checks, strict response validation and cancellation remain enforced. Malformed or foreign rows fail the read instead of producing a false empty history.

The governed summary consumes the same historical facts. A second integration defect caused every eligible chart point to disappear: its reference code used a colon, which the shared citation validator rejects. Using a dot preserves the same package/dataset identity and allows the real citation boundary to validate it. The response schema now also accepts a signed Z-score, matching the existing mobile contract. Clinical calculations, approved artifacts, package digests, source coefficients and interpretations are unchanged.

PostgREST's supported column casting is documented in [Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html#casting-columns).

## Fresh verification

- Initial regressions reproduced missing historical facts, wrong RPC selection, negative Z-score rejection and chart-point loss before their respective corrections.
- Final backend run: **63 suites passed; 437 tests passed, 1 existing test skipped**. Command: `vitest run tests/channels/creciendo tests/persistence/anthropometry-repository.test.ts tests/clinical/anthropometry tests/access`, with synthetic test-only runtime configuration. An earlier run lacked the required configuration and could not import two channel suites; the configured final run passed both.
- Mobile route/store/client/submission regression: **4 suites, 25 tests passed**. Tests cover the real route with a fake transport, session restoration, retry, save/reload and returning from a rejected form.
- Backend `tsc --noEmit`, `npm run build`, and `git diff --check`: exit 0.
- Built local server without credentials: HTTP 401 `AUTHENTICATION_REQUIRED`.

## User-authorized authenticated verification

The user provided a test account, activated the existing ngrok tunnel, and explicitly authorized an arbitrary fictional measurement. Credentials were supplied through hidden stdin, were not saved to repository files, and were not printed. Diagnostic output contained only statuses, counts and bounded codes. Diagnostic sign-outs were scoped to each newly created local session.

For a child with current backend permission, the actual authenticated API returned six historical records before the create and seven afterwards. Create returned HTTP 201. Repeating the same confirmed command with the same idempotency key returned HTTP 200 `idempotent_replay` and the same record. History contained that record exactly once and its value matched the submitted test value. Exactly one fictional measurement was left in the test account at the user's request.

After the final build/restart, authenticated checks through the existing public ngrok URL returned HTTP 200 for child context, history and summary: **seven history records and five governed chart points**. No second measurement was created for this final check.

The test directory also contains profiles which the authoritative scope RPC denies. Their permissions were not changed. This separate observation is being investigated under the user's follow-up request about child registration.

The configured tunnel was initially offline. Automatic review refused agent-initiated tunnel creation due to external exposure. The user subsequently activated the existing tunnel themselves; its target was verified as localhost port 2000. The corrected local backend remains running there. No production deployment, database migration, clinical-package activation, environment-file edit, push or commit was performed. Native device rendering and store-distributed binaries were not tested in this correction.
