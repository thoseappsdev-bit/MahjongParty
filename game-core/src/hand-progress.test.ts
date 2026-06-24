import { describe, expect, it } from "vitest";
import { evaluateHandProgress } from "./hand-progress";
import { evaluateHandProgress as evaluateHandProgressFromIndex } from "./index";

describe("hand progress", () => {
  it("identifies a standard hand in tenpai", () => {
    expect(evaluateHandProgress(["m1", "m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "we", "we"])).toEqual(
      {
        shanten: 0,
        kind: "standard",
      },
    );
  });

  it("identifies seven pairs in tenpai", () => {
    expect(evaluateHandProgress(["m1", "m1", "m2", "m2", "p3", "p3", "p4", "p4", "s5", "s5", "we", "we", "dr"])).toEqual({
      shanten: 0,
      kind: "seven-pairs",
    });
  });

  it("identifies thirteen orphans in tenpai", () => {
    expect(evaluateHandProgress(["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"])).toEqual({
      shanten: 0,
      kind: "thirteen-orphans",
    });
  });

  it("counts open melds toward standard progress", () => {
    expect(evaluateHandProgress(["p2", "p3", "p4", "s5", "s6", "s7", "we", "we", "dr", "dr"], ["CHOW m1 m2 m3"])).toMatchObject({
      shanten: 0,
      kind: "standard",
    });
  });

  it("rejects bonus tiles, invalid codes, and more than four copies", () => {
    expect(() => evaluateHandProgress(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "f1"])).toThrow(
      /bonus tile/i,
    );
    expect(() => evaluateHandProgress(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "x1"])).toThrow(
      /invalid tile code/i,
    );
    expect(() =>
      evaluateHandProgress(["m1", "m1", "m1", "m1", "m1", "p2", "p3", "p4", "s5", "s6", "s7", "we", "we"]),
    ).toThrow(/more than four copies/i);
  });

  it("re-exports the evaluator from the package entrypoint", () => {
    expect(evaluateHandProgressFromIndex).toBe(evaluateHandProgress);
  });
});
