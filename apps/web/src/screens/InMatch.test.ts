import { describe, expect, it } from "vitest";
import { actionInfoKeyFor, actionLabelKeyFor } from "./InMatch";

describe("InMatch action terminology", () => {
  it("uses beginner-friendly Riichi terms for action buttons", () => {
    expect(actionLabelKeyFor("chi", "riichi")).toBe("match.riichiChi");
    expect(actionLabelKeyFor("pong", "riichi")).toBe("match.riichiPon");
    expect(actionLabelKeyFor("kong", "riichi")).toBe("match.riichiKan");
    expect(actionLabelKeyFor("win", "riichi")).toBe("match.riichiWin");
    expect(actionInfoKeyFor("win", "riichi")).toBe("actionInfo.riichiWin");
  });

  it("keeps Old Hong Kong action labels unchanged", () => {
    expect(actionLabelKeyFor("pong", "3-fan")).toBe("match.pong");
    expect(actionInfoKeyFor("discard", "1-fan")).toBe("actionInfo.discard");
  });
});