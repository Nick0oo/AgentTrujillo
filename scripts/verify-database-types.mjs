import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGET_PATH,
  buildGenerateCommand,
  normalizeGeneratedTypes,
  runLinkedGenerator,
  validateGeneratedTypes,
} from "./generate-database-types.mjs";

export function buildVerifyCommand() {
  return buildGenerateCommand();
}

function digest(source) {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function compareGeneratedTypes(expected, actual) {
  const normalizedExpected = normalizeGeneratedTypes(expected);
  const normalizedActual = normalizeGeneratedTypes(actual);
  if (normalizedExpected === normalizedActual) return { ok: true };
  return {
    ok: false,
    category: "TYPE_DRIFT",
    expectedBytes: Buffer.byteLength(normalizedExpected),
    actualBytes: Buffer.byteLength(normalizedActual),
    expectedChecksum: digest(normalizedExpected),
    actualChecksum: digest(normalizedActual),
  };
}

export function verifyDatabaseTypes({ targetPath = TARGET_PATH, runCommand = runLinkedGenerator } = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "supabase-types-"));
  const temporaryPath = join(temporaryDirectory, "database.types.ts");
  try {
    const committed = readFileSync(targetPath, "utf8");
    const result = runCommand(buildVerifyCommand());
    if (result.status !== 0) {
      return { ok: false, category: "GENERATION_FAILED", stderr: result.stderr };
    }
    const generated = validateGeneratedTypes(result.stdout);
    writeFileSync(temporaryPath, generated, "utf8");
    const comparison = compareGeneratedTypes(committed, readFileSync(temporaryPath, "utf8"));
    return comparison.ok
      ? { ok: true, bytes: Buffer.byteLength(generated), checksum: digest(generated) }
      : comparison;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = verifyDatabaseTypes();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
