import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Old Hong Kong tile artwork", () => {
  it.each([
    ["m1", "42"],
    ["p1", "26"],
    ["s1", "26"],
  ])("uses a readable rank numeral on %s", (code, fontSize) => {
    const svg = readFileSync(new URL(`../../../public/assets/tiles/old-hk/${code}.svg`, import.meta.url), "utf8");

    expect(svg).toContain(`font-size="${fontSize}"`);
  });
});
