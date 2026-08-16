import { readFile } from "node:fs/promises";
import { stdin } from "node:process";
import { verifyArtifactBytes } from "../../src/clinical/governance/checksum.ts";

function usage() {
  process.stderr.write("usage: npm run verify:clinical-artifact -- <path|-> --expected <lowercase-sha256>\n");
}

function expectedDigest(args) {
  const index = args.indexOf("--expected");
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return undefined;
  return value;
}

const input = process.argv[2];
const expected = expectedDigest(process.argv.slice(2));
if (!input || !expected) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const bytes = input === "-" ? Buffer.from(await new Response(stdin).arrayBuffer()) : await readFile(input);
    verifyArtifactBytes(bytes, expected);
    process.stdout.write("verified\n");
    process.exitCode = 0;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "INVALID_ARTIFACT";
    process.stderr.write(`${code}\n`);
    process.exitCode = 3;
  }
}
