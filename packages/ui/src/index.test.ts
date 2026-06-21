import { describe, expect, it } from "vitest";
import { tokens } from "./tokens";

describe("tokens", () => {
  it("keeps readable tile size in the shared contract", () => {
    expect(tokens.tile.minReadablePx).toBeGreaterThanOrEqual(34);
  });
});
