import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error The verifier is intentionally dependency-free JavaScript.
import { verifyBaseline } from "../../scripts/verify-eve-baseline.mjs";

const validVersions = {
  declared: "0.27.13",
  locked: "0.27.13",
  installed: "0.27.13",
  nodeMajor: 24,
};

describe("Eve version baseline", () => {
  it("accepts the exact supported versions", () => {
    expect(verifyBaseline(validVersions)).toBe(true);
  });

  it.each([
    ["declared", { declared: "^0.27.13" }],
    ["locked", { locked: "0.27.11" }],
    ["installed", { installed: "0.27.11" }],
    ["Node major", { nodeMajor: 22 }],
  ])("rejects %s drift without exposing unrelated values", (_label, drift) => {
    expect(() => verifyBaseline({ ...validVersions, ...drift })).toThrow(
      /Eve drift requires reading the new bundled docs/,
    );
  });

  it("preserves real ESM globals beside bundler-suffixed shims", async () => {
    const bannerModuleUrl = pathToFileURL(
      resolve(
        process.cwd(),
        "node_modules/eve/dist/src/internal/node-esm-compat-banner.js",
      ),
    ).href;
    const { buildNodeEsmCompatBanner } = (await import(bannerModuleUrl)) as {
      buildNodeEsmCompatBanner(source: string): string;
    };
    const bundledSource = [
      "const __filename$1 = import.meta.filename;",
      "const __dirname$1 = import.meta.dirname;",
      "await Promise.resolve();",
    ].join("\n");

    const banner = buildNodeEsmCompatBanner(bundledSource);

    expect(banner).toContain("const __filename =");
    expect(banner).toContain("const __dirname =");
  });

  it("resolves package-owned files from an external bundled host", async () => {
    const packageModuleUrl = pathToFileURL(
      resolve(
        process.cwd(),
        "node_modules/eve/dist/src/internal/application/package.js",
      ),
    ).href;
    const packageModule = (await import(packageModuleUrl)) as {
      resolvePackageLocationFromModulePath?: (
        modulePath: string,
        resolveManifest: (modulePath: string) => string,
      ) => { packageRoot: string; packageBuildRoot: string | null };
    };
    expect(packageModule.resolvePackageLocationFromModulePath).toBeTypeOf(
      "function",
    );

    const installedRoot = realpathSync(
      resolve(process.cwd(), "node_modules/eve"),
    );
    const location = packageModule.resolvePackageLocationFromModulePath!(
      fileURLToPath(import.meta.url),
      () => resolve(installedRoot, "package.json"),
    );

    expect(realpathSync(location.packageRoot)).toBe(installedRoot);
    expect(realpathSync(location.packageBuildRoot!)).toBe(
      realpathSync(resolve(installedRoot, "dist")),
    );
  });
});
