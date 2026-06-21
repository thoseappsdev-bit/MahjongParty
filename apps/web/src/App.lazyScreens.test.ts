import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("App route bundle boundaries", () => {
  it("lazy-loads route screens instead of importing the screen barrel eagerly", () => {
    expect(source).toContain("lazy(() => import(\"./screens/InMatch\")");
    expect(source).not.toContain("} from \"./screens\"");
  });
});