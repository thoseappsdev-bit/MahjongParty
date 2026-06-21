import { describe, expect, it } from "vitest";
import { dueForBot, markConnected, markDisconnected, nextAlarmAt, type DisconnectMap } from "./disconnect-tracker";

const GRACE = 30_000;

describe("disconnect tracker", () => {
  it("records and clears disconnects immutably", () => {
    const empty: DisconnectMap = {};
    const one = markDisconnected(empty, "user-1", 1000);
    expect(empty).toEqual({});
    expect(one).toEqual({ "user-1": 1000 });
    expect(markConnected(one, "user-1")).toEqual({});
    expect(markConnected(one, "missing")).toBe(one); // no-op returns same reference
  });

  it("only returns users past the grace window", () => {
    const map = markDisconnected(markDisconnected({}, "a", 0), "b", 10_000);
    expect(dueForBot(map, GRACE - 1, GRACE)).toEqual([]);
    expect(dueForBot(map, GRACE, GRACE)).toEqual(["a"]); // a disconnected at 0
    expect(dueForBot(map, 10_000 + GRACE, GRACE)).toEqual(["a", "b"]);
  });

  it("reconnecting cancels a pending bot conversion", () => {
    let map = markDisconnected({}, "a", 0);
    map = markConnected(map, "a"); // reconnected
    expect(dueForBot(map, GRACE * 2, GRACE)).toEqual([]);
  });

  it("schedules the alarm at the earliest disconnect + grace", () => {
    expect(nextAlarmAt({}, GRACE)).toBeNull();
    const map = markDisconnected(markDisconnected({}, "a", 5_000), "b", 1_000);
    expect(nextAlarmAt(map, GRACE)).toBe(1_000 + GRACE);
  });
});
