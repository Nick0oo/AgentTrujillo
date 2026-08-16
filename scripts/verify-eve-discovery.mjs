import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const FORBIDDEN_RUNTIME_NAMES = Object.freeze([
  "agent",
  "bash",
  "glob",
  "grep",
  "read_file",
  "web_fetch",
  "web_search",
  "workflow",
  "write_file",
]);

export function extractJson(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("Eve info output did not contain JSON");

  let depth = 0;
  let escaped = false;
  let inString = false;
  for (let index = start; index < stdout.length; index += 1) {
    const character = stdout[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(stdout.slice(start, index + 1));
    }
  }
  throw new Error("Eve info output contained incomplete JSON");
}

function sortedStrings(values = []) {
  return [...values].map(String).sort((left, right) => left.localeCompare(right));
}

function namedValues(values = []) {
  return values.map((value) => {
    if (typeof value === "string") return value;
    return value?.name ?? value?.slug ?? value?.tool ?? JSON.stringify(value);
  });
}

function sortedChannels(values = []) {
  return [...values]
    .map(({ name, kind, method, urlPath }) => ({ name, kind, method, urlPath }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function projectSurface(info) {
  const model = typeof info.model === "string" ? info.model : "";
  const separator = model.indexOf("/");
  const providerRoute = separator === -1 ? model : model.slice(0, separator);
  const modelId = separator === -1 ? "" : model.slice(separator + 1);

  return {
    status: info.status,
    diagnostics: {
      errors: Number(info.diagnostics?.errors ?? 0),
      warnings: Number(info.diagnostics?.warnings ?? 0),
    },
    provider: providerRoute === "google" ? "google.generative-ai" : providerRoute,
    modelId,
    instructions: info.instructions,
    skills: sortedStrings(info.skills),
    authoredTools: sortedStrings(namedValues(info.tools)),
    subagents: sortedStrings(namedValues(info.subagents)),
    schedules: sortedStrings(namedValues(info.schedules)),
    channels: sortedChannels(info.channels),
    messaging: info.messaging ?? {},
  };
}

function diffValues(actual, expected, path = "$") {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return [];
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return [path + ": actual " + JSON.stringify(actual) + "; expected " + JSON.stringify(expected)];
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
    return keys.flatMap((key) => diffValues(actual[key], expected[key], path + "." + key));
  }
  return [path + ": actual " + JSON.stringify(actual) + "; expected " + JSON.stringify(expected)];
}

export function compareSurface(actual, expected) {
  return diffValues(actual, expected);
}

function findStrings(value, found = []) {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => findStrings(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => findStrings(item, found));
  return found;
}

export function findForbiddenNames(info) {
  const forbidden = new Set(FORBIDDEN_RUNTIME_NAMES);
  return sortedStrings(findStrings(info).filter((value) => forbidden.has(value)));
}

function runInfo() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const eveCli = resolve(root, "node_modules/eve/bin/eve.js");
  try {
    return extractJson(execFileSync(process.execPath, [eveCli, "info", "--json"], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    throw new Error("eve info failed: " + (stderr.trim() || stdout.trim() || "unknown error"));
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const fixturePath = resolve(root, "tests/fixtures/runtime/eve-info-module-01.json");
  const info = runInfo();
  const actual = projectSurface(info);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const forbidden = findForbiddenNames(info);
  const differences = compareSurface(actual, fixture);
  if (forbidden.length > 0 || differences.length > 0) {
    if (forbidden.length > 0) console.error("forbidden runtime names: " + forbidden.join(", "));
    if (differences.length > 0) console.error(differences.join("\n"));
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify(actual) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
