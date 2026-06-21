import { describe, expect, it } from "vitest";
import type { MatchView, Seat } from "@mahjong/shared-types";
import { classifyPixiBoardEvents } from "./pixiBoardEvents";

describe("pixi board visual events", () => {
  it("returns no visual events without a previous state", () => {
    expect(classifyPixiBoardEvents(null, view({ recentEvent: "Lina wins with m5." }))).toEqual([]);
  });

  it("classifies a local discard count increase as a discard event", () => {
    const previous = view({ discards: { 0: ["m1"] } });
    const current = view({ discards: { 0: ["m1", "m2"] } });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "discard", seat: 0, tile: "m2" }]);
  });

  it("classifies a hand count increase as a draw event", () => {
    const previous = view({ handCounts: { 2: 12 } });
    const current = view({ handCounts: { 2: 13 } });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "draw", seat: 2 }]);
  });

  it("classifies a new claim prompt as a claim event", () => {
    const previous = view({ claimPrompt: null, turnSeat: 3 });
    const current = view({ claimPrompt: "Pong m5?", turnSeat: 3 });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "claim", seat: 3 }]);
  });

  it("classifies recent kong text as a kong event", () => {
    const previous = view({ recentEvent: "Chen Bot discarded m5." });
    const current = view({ recentEvent: "Dewi Bot declares Kong with dr." });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "kong", seat: 3 }]);
  });

  it("classifies recent wins text as a win event", () => {
    const previous = view({ recentEvent: "Lina discarded m5." });
    const current = view({ recentEvent: "Bo Bot wins with m5." });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "win", seat: 1 }]);
  });

  it("classifies turn seat changes as a turn event", () => {
    const previous = view({ turnSeat: 0 });
    const current = view({ turnSeat: 2 });

    expect(classifyPixiBoardEvents(previous, current)).toEqual([{ type: "turn", seat: 2 }]);
  });

  it("orders structural events before text fallback events", () => {
    const previous = view({ discards: { 0: ["m1"] }, recentEvent: "Lina discarded m1." });
    const current = view({ discards: { 0: ["m1", "m2"] }, recentEvent: "Dewi Bot declares Kong with dr." });

    expect(classifyPixiBoardEvents(previous, current).map((event) => event.type)).toEqual(["discard", "kong"]);
  });
});

interface ViewOptions {
  claimPrompt?: string | null;
  discards?: Partial<Record<Seat, string[]>>;
  handCounts?: Partial<Record<Seat, number>>;
  recentEvent?: string;
  turnSeat?: Seat;
}

function view(options: ViewOptions = {}): MatchView {
  return {
    handNumber: 1,
    mode: "3-fan",
    tableType: "friendly",
    turnSeat: options.turnSeat ?? 0,
    mySeat: 0,
    timerSeconds: 25,
    wallCount: 64,
    claimPrompt: options.claimPrompt ?? null,
    legalActions: ["discard"],
    myHand: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "we", "ws", "dr", "dw"],
    players: [player(0, options), player(1, options), player(2, options), player(3, options)],
    recentEvent: options.recentEvent ?? "Lina is thinking.",
  };
}

function player(seat: Seat, options: ViewOptions): MatchView["players"][number] {
  return {
    seat,
    name: ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"][seat],
    avatar: ["L", "B", "C", "D"][seat],
    wind: ["E", "S", "W", "N"][seat] as "E" | "S" | "W" | "N",
    isBot: seat !== 0,
    handCount: options.handCounts?.[seat] ?? 13,
    melds: [],
    discards: options.discards?.[seat] ?? [],
    coinsDelta: 0,
    connected: true,
  };
}

