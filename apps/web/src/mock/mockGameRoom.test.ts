import { describe, expect, it } from "vitest";
import { advanceMatch, createPracticeRoom, startMatch } from "./mockGameRoom";

describe("mock game room flow", () => {
  it("creates a practice room that starts directly against bots", () => {
    const room = createPracticeRoom();

    expect(room.config.tableType).toBe("friendly");
    expect(room.config.privacy).toBe("private");
    expect(room.seats.every((seat, index) => index === 0 || seat.isBot)).toBe(true);
  });

  it("returns the match to the player after a discard by simulating bot turns", () => {
    const view = startMatch(createPracticeRoom());
    const next = advanceMatch(view, { type: "discard", tile: view.myHand[0] });

    expect(next.turnSeat).toBe(next.mySeat);
    expect(next.legalActions).toContain("discard");
    expect(next.myHand).toHaveLength(view.myHand.length - 1);
    expect(next.players[1].discards.length).toBeGreaterThan(view.players[1].discards.length);
    expect(next.recentEvent).toContain("Your turn");
  });
});
