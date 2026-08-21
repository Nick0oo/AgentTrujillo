# Module 01 runtime and harness closure evidence

Date: 2026-08-21

Branch: `codex/close-roadmap-01-07`

## Verified baseline

- Node.js `24.18.0`, npm `11.16.0`.
- Eve `0.27.13`, pinned exactly in declaration and lockfile.
- `@ai-sdk/google` `4.0.44` with provider-native model `gemini-3.6-flash`.
- Framework patch commit: `5501fd4`.
- Runtime-eval stabilization commit: `ec05602`.
- Product-owner conveyed clinical wording approval: `docs/clinical/approval-record-2026-08-21.md`.

Eve `0.27.13` is the smallest audited patch selected in the approved 0.27 line that contains the ESM compatibility fix, the Windows installed-package resolution fix, and the Undici 8 security update needed by this repository. Regression tests exercise both runtime defects without patching `node_modules`.

## Fresh commands

| Command | Result |
| --- | --- |
| `npm run verify:eve-baseline` | passed; Eve `0.27.13`, Node `24.x` |
| `npm test -- --run tests/runtime` | passed; 16 files, 81 tests |
| `npm run typecheck` | passed |
| `npm audit --omit=dev` | passed; 0 known vulnerabilities |
| `npm run build` | passed after archiving one stale generated `.output`; build target warning remains Windows `win32-x64` and is a module 15 deployment concern |
| `npm run verify:discovery` twice | passed twice; zero diagnostics |
| `npx eve eval --list` | passed; all six runtime eval IDs discovered |
| `npm run eval:runtime` twice | passed twice; 6/6 cases and 67/67 gates on each run |
| `git diff --check` | passed |

Discovery records exactly three product skills, no authored tools, no subagents, no schedules, and six Eve-owned authenticated HTTP routes. Eve `0.27.13` adds the framework-owned continuation-token reset route; module 11 must not treat it as the guardian-facing Creciendo reset contract and must retain its own authorization/ownership checks.

## Live Gemini evidence

Only synthetic fixtures were used. Both strict serial runs used direct Gemini with no judge, fallback, or alternate provider.

| Eve artifact ID | Cases | Gates | Input tokens | Output tokens | Event span |
| --- | ---: | ---: | ---: | ---: | ---: |
| `2026-08-21T21-15-53` | 6/6 | 67/67 | 25,221 | 6,758 | 55.2 s |
| `2026-08-21T21-17-33` | 6/6 | 67/67 | 31,578 | 7,095 | 57.9 s |

The direct-provider artifacts do not emit a trustworthy monetary cost field, so no cost was invented. Exact scans of both artifact trees found zero occurrences of the Google key, Supabase service-role key, publishable key, or project URL. All `noFailedActions` gates passed. The local queue emitted a teardown-only HTTP 503 after each completed summary and process exit code 0; no case, action, or gate failed.

## Accepted boundaries and residual gates

- Module 01 performs no Supabase mutation and activates no clinical package.
- Hosted sandbox egress denial remains a module 15 preview/production verification gate; local deny-all configuration and contracts pass here.
- The native Windows build warning is not evidence for a Linux production artifact; module 15 must build and smoke-test on the actual deployment platform.
- Deterministic red-flag behavior and authenticated Creciendo session routes remain owned by modules 04 and 11 respectively.
