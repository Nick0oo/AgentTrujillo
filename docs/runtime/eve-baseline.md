# Eve runtime baseline

The approved runtime baseline is Eve `0.27.1` with Node.js `24.x`. The
dependency is pinned exactly in `package.json` and `package-lock.json`.

## Installed package record

- Package: `eve@0.27.1`
- Resolved artifact: `https://registry.npmjs.org/eve/-/eve-0.27.1.tgz`
- Integrity: `sha512-KNyW1PBgUPqOx3+tNqztN1tCucCMlk3fI78erabch1iHXv4MM9/SvHRNyKlpukohNpJz2TNM7u+/Eak1gdRAaQ==`
- Runtime baseline: Node.js `24.x`
- Bundled source of truth: `node_modules/eve/docs/`

## Required reading order

Read the installed documentation before changing Eve-authored code:

1. `docs/README.md`
2. `docs/introduction.md`
3. `docs/getting-started.mdx`
4. `docs/reference/project-layout.md`
5. `docs/agent-config.md`
6. `docs/reference/typescript-api.md`
7. The guide named by the active roadmap work unit
8. `docs/reference/cli.md` for `info`, build, and debugging behavior

The installed package version and its bundled docs take precedence over
remembered APIs or documentation for another Eve release.

## Authored slots

Eve discovers runtime behavior from the repository filesystem. The supported
slots are `agent/agent.ts`, `agent/instructions.md`, `agent/skills/`,
`agent/tools/`, `agent/channels/`, `agent/sandbox.ts`,
`agent/instrumentation.ts`, `agent/subagents/`, and root `evals/` files.
Path-derived names are part of the runtime contract.

## Verification commands

Use the local CLI and do not rely on a global Eve installation:

```powershell
npm run verify:eve-baseline
npx eve info --json
npm run typecheck
npm run build
```

Discovery output must be reviewed for diagnostics and the intended compiled
surface. Generated `.eve/` artifacts are local inspection output and must not
be committed.

## Upgrade procedure

An Eve upgrade is a separate reviewed work unit. Read the new bundled docs in
full for every affected authored slot, pin the new version exactly, refresh
the lockfile, update this record and the baseline verifier, then run
typecheck, tests, `eve info --json`, build, and all applicable evals. Review
the compiled surface and create a focused commit; never allow a caret range or
silent minor-version drift.
