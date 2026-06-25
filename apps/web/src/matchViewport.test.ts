import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("match viewport layout", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("keeps the board and timed actions inside a single dynamic viewport", () => {
    expect(css).toContain(".app-shell-match {");
    expect(css).toContain("height: 100dvh;");
    expect(css).toContain("grid-template-rows: minmax(0, 1fr);");
    expect(css).toContain(".app-shell-match .match-screen {");
    expect(css).toContain("grid-template-rows: auto minmax(280px, 1fr) auto auto;");
    expect(css).toContain(".tutorial-card {");
    expect(css).toContain("position: absolute;");
    expect(css).toContain(".action-bar {");
    expect(css).toContain("position: sticky;");
    expect(css).toContain("bottom: 0;");
  });
});
