import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const EXPECTED_EVE_VERSION = "0.27.1";
const EXPECTED_NODE_MAJOR = 24;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readBaselineVersions(root) {
  const packageJson = readJson(resolve(root, "package.json"));
  const lockJson = readJson(resolve(root, "package-lock.json"));
  const installedPackageJson = readJson(
    resolve(root, "node_modules/eve/package.json"),
  );

  return {
    declared: packageJson.dependencies?.eve,
    locked: lockJson.packages?.["node_modules/eve"]?.version,
    installed: installedPackageJson.version,
    nodeMajor: Number(process.versions.node.split(".")[0]),
  };
}

export function verifyBaseline(versions) {
  const failures = [];

  if (versions.declared !== EXPECTED_EVE_VERSION) {
    failures.push(`declared=${String(versions.declared)}`);
  }
  if (versions.locked !== EXPECTED_EVE_VERSION) {
    failures.push(`locked=${String(versions.locked)}`);
  }
  if (versions.installed !== EXPECTED_EVE_VERSION) {
    failures.push(`installed=${String(versions.installed)}`);
  }
  if (versions.nodeMajor !== EXPECTED_NODE_MAJOR) {
    failures.push(`nodeMajor=${String(versions.nodeMajor)}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Eve baseline verification failed: ${failures.join(", ")}. ` +
        "Eve drift requires reading the new bundled docs, updating the baseline record, " +
        "running discovery/build/evals, and creating a separate reviewed commit.",
    );
  }

  return true;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const root = dirname(dirname(scriptPath));
  const versions = readBaselineVersions(root);
  verifyBaseline(versions);
  console.log(
    `Eve baseline verified: ${EXPECTED_EVE_VERSION}; Node ${versions.nodeMajor}.x`,
  );
}
