import { describe, expect, it } from "vitest";
import { buildRiichiWall, doraForIndicator } from "./index";

describe("riichi tile helpers", () => {
  it("builds a 136-tile wall with four copies of each base tile", () => {
    const wall = buildRiichiWall();

    expect(wall).toHaveLength(136);
    expect(wall.filter((tile) => tile === "m5")).toHaveLength(4);
    expect(wall.filter((tile) => tile === "we")).toHaveLength(4);
    expect(wall.filter((tile) => tile === "dw")).toHaveLength(4);
  });

  it("maps dora indicators using WRC riichi cycles", () => {
    expect(doraForIndicator("m9")).toBe("m1");
    expect(doraForIndicator("wn")).toBe("we");
    expect(doraForIndicator("dw")).toBe("dg");
  });
});
