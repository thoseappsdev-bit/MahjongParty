import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Pixi CSP runtime", () => {
  it("installs the no-eval shader adapters before creating the renderer", () => {
    const source = readFileSync(new URL("./pixiRuntime.ts", import.meta.url), "utf8");
    expect(source).toContain('import "pixi.js/unsafe-eval";');
  });
});