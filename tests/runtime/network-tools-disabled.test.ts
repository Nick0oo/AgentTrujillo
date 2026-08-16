import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import webFetch from "../../agent/tools/web_fetch";
import webSearch from "../../agent/tools/web_search";

describe("arbitrary network tool lockdown", () => {
  it("disables both arbitrary network defaults", () => {
    expect(webFetch).toEqual({ kind: "eve:disabled-tool" });
    expect(webSearch).toEqual({ kind: "eve:disabled-tool" });
  });

  it("does not expose connections or provider-managed search", () => {
    expect(existsSync("agent/connections")).toBe(false);

    const modelSource = readFileSync("agent/lib/model/google.ts", "utf8");
    expect(modelSource).not.toMatch(/tools\.googleSearch|grounding|web_search/i);
  });
});
