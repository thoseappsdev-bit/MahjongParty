import { describe, expect, it } from "vitest";
import { discardViewportClip, nextDiscardScrollY } from "./pixiDiscardScroll";

describe("discard auto-scroll", () => {
  it("follows the newest row when a discard is added", () => {
    expect(nextDiscardScrollY(19, 20, 24, 180)).toBe(180);
  });

  it("preserves manual scrolling between discards", () => {
    expect(nextDiscardScrollY(20, 20, 64, 180)).toBe(64);
  });

  it("clamps the current position when overflow shrinks", () => {
    expect(nextDiscardScrollY(20, 18, 180, 90)).toBe(90);
  });

  it("clips scrolling tiles below the round title and inside the frame", () => {
    expect(discardViewportClip({ x: 100, y: 80, width: 600, height: 260 }, "desktop")).toEqual({
      x: 102,
      y: 124,
      width: 588,
      height: 206,
    });
  });
});

