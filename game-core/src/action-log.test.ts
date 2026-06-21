import { describe, expect, it } from "vitest";
import { appendMatchEvent, replayMatchEvents, type MatchEventInput } from "./action-log";

describe("match action log", () => {
  it("appends events with caller timestamps and monotonically increasing sequence numbers", () => {
    const first: MatchEventInput = {
      occurredAt: "2026-06-15T10:00:00.000Z",
      action: { type: "discard", actorSeat: 0, payload: { tile: "5M" } },
    };
    const second: MatchEventInput = {
      occurredAt: "2026-06-15T10:00:03.000Z",
      action: { type: "claim", actorSeat: 1, payload: { claim: "pong", fromSeat: 0 } },
    };

    const withFirst = appendMatchEvent([], first);
    const withSecond = appendMatchEvent(withFirst, second);

    expect(withFirst).toEqual([{ sequence: 1, ...first }]);
    expect(withSecond).toEqual([
      { sequence: 1, ...first },
      { sequence: 2, ...second },
    ]);
    expect(withFirst).toHaveLength(1);
  });

  it("continues sequence numbers from the current highest log entry", () => {
    const log = [
      {
        sequence: 7,
        occurredAt: 1813053600000,
        action: { type: "draw", actorSeat: 2 },
      },
    ];

    const next = appendMatchEvent(log, {
      occurredAt: 1813053600200,
      action: { type: "discard", actorSeat: 2, payload: { tile: "E" } },
    });

    expect(next.at(-1)?.sequence).toBe(8);
    expect(log).toHaveLength(1);
  });

  it("replays events in sequence with the supplied reducer", () => {
    const events = appendMatchEvent(
      appendMatchEvent([], {
        occurredAt: 1,
        action: { type: "draw", actorSeat: 0, payload: { tile: "1M" } },
      }),
      {
        occurredAt: 2,
        action: { type: "discard", actorSeat: 0, payload: { tile: "1M" } },
      },
    );

    const finalState = replayMatchEvents({ hand: [] as string[], discards: [] as string[] }, events, (state, event) => {
      if (event.action.type === "draw") {
        return { ...state, hand: [...state.hand, event.action.payload?.tile as string] };
      }
      if (event.action.type === "discard") {
        return {
          hand: state.hand.filter((tile) => tile !== event.action.payload?.tile),
          discards: [...state.discards, event.action.payload?.tile as string],
        };
      }
      return state;
    });

    expect(finalState).toEqual({ hand: [], discards: ["1M"] });
  });

  it("rejects duplicate sequence numbers during replay", () => {
    expect(() =>
      replayMatchEvents(
        0,
        [
          { sequence: 1, occurredAt: 1, action: { type: "draw" } },
          { sequence: 1, occurredAt: 2, action: { type: "discard" } },
        ],
        (state) => state + 1,
      ),
    ).toThrow(/duplicate sequence/i);
  });

  it("rejects out-of-order sequence numbers during replay", () => {
    expect(() =>
      replayMatchEvents(
        0,
        [
          { sequence: 2, occurredAt: 1, action: { type: "draw" } },
          { sequence: 1, occurredAt: 2, action: { type: "discard" } },
        ],
        (state) => state + 1,
      ),
    ).toThrow(/out-of-order sequence/i);
  });
});
