import { describe, expect, it } from "vitest";
import {
  advancePracticeBotTurn,
  createPracticeMatch,
  createTutorialMatch,
  isWinningCodes,
  practiceToMatchView,
  resolvePracticeAction,
} from "./practice-engine";

describe("practice engine", () => {
  it("deals deterministic hands from the same seed", () => {
    const first = createPracticeMatch("friend-demo");
    const second = createPracticeMatch("friend-demo");

    expect(first.players[0].hand).toEqual(second.players[0].hand);
    expect(first.players[0].hand).toHaveLength(14);
    expect(first.players[1].hand).toHaveLength(13);
    expect(first.wall.length).toBe(91);
  });

  it("removes the selected discard and queues bot turns one at a time", () => {
    const match = createPracticeMatch("bot-cycle");
    const selectedTile = match.players[0].hand[3];
    const copiesBefore = match.players[0].hand.filter((tile) => tile === selectedTile).length;
    const next = resolvePracticeAction(match, { type: "discard", tile: selectedTile });

    expect(next.players[0].hand.filter((tile) => tile === selectedTile)).toHaveLength(copiesBefore - 1);
    expect(next.players[0].hand).toHaveLength(13);
    expect(next.pendingBotSeats).toEqual([1, 2, 3]);
    expect(next.turnSeat).toBe(1);
    expect(next.phase).toBe("playing");
  });

  it("advances one queued bot turn per step and then returns to the player", () => {
    const match = createPracticeMatch("bot-step");
    const afterDiscard = resolvePracticeAction(match, { type: "discard", tile: match.players[0].hand[0] });
    const afterBo = advancePracticeBotTurn(afterDiscard);
    const afterChen = advancePracticeBotTurn(afterBo);
    const afterDewi = advancePracticeBotTurn(afterChen);

    expect(afterBo.players[1].discards.length).toBeGreaterThan(match.players[1].discards.length);
    expect(afterBo.pendingBotSeats).toEqual([2, 3]);
    expect(afterChen.players[2].discards.length).toBeGreaterThan(match.players[2].discards.length);
    expect(afterChen.pendingBotSeats).toEqual([3]);
    expect(afterDewi.players[3].discards.length).toBeGreaterThan(match.players[3].discards.length);
    expect(afterDewi.pendingBotSeats).toEqual([]);
    expect(afterDewi.turnSeat).toBe(0);
    expect(afterDewi.players[0].hand).toHaveLength(14);
  });

  it("has bots discard isolated singletons before breaking pairs or sequences", () => {
    const match = createPracticeMatch("bot-discard-shape");
    const shaped = {
      ...match,
      wall: ["m5", ...match.wall],
      players: [
        { ...match.players[0], hand: ["m1", "m2", "m3", "p2", "p3", "p4", "s2", "s3", "s4", "we", "ws", "ww", "dr", "dg"] },
        { ...match.players[1], hand: ["m2", "m2", "m3", "m4", "p2", "p3", "p4", "p7", "p8", "s3", "s4", "s5", "s9"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const afterPlayer = resolvePracticeAction(shaped, { type: "discard", tile: "m1" });
    const afterBot = advancePracticeBotTurn(afterPlayer);

    expect(afterBot.players[1].discards.at(-1)).toBe("s9");
    expect(afterBot.players[1].hand).toEqual(expect.arrayContaining(["m2", "m2", "m3", "m4", "p2", "p3", "p4", "s3", "s4", "s5"]));
  });

  it("has bots preserve flexible sequence waits over loose terminal tiles", () => {
    const match = createPracticeMatch("bot-preserve-waits");
    const shaped = {
      ...match,
      wall: ["s6", ...match.wall],
      players: [
        { ...match.players[0], hand: ["m1", "m2", "m3", "p2", "p3", "p4", "s2", "s3", "s4", "we", "ws", "ww", "dr", "dg"] },
        { ...match.players[1], hand: ["m2", "m3", "p2", "p3", "p4", "p5", "s2", "s3", "s4", "s5", "we", "dg", "m9"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const afterPlayer = resolvePracticeAction(shaped, { type: "discard", tile: "m1" });
    const afterBot = advancePracticeBotTurn(afterPlayer);

    expect(afterBot.players[1].discards.at(-1)).toBe("m9");
    expect(afterBot.players[1].hand).toEqual(expect.arrayContaining(["m2", "m3"]));
  });

  it("does not offer pong when it breaks the player's only pair in an otherwise shaped hand", () => {
    const match = createPracticeMatch("avoid-useless-pong");
    const claimable = {
      ...match,
      wall: ["s8", ...match.wall],
      players: [
        { ...match.players[0], hand: ["m1", "m2", "m3", "m8", "m8", "p2", "p3", "p4", "p6", "p7", "s2", "s3", "s4", "dg"] },
        { ...match.players[1], hand: ["m4", "m5", "m6", "p1", "p2", "p3", "p9", "s1", "s2", "s3", "s4", "s5", "m8"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const next = advancePracticeBotTurn(resolvePracticeAction(claimable, { type: "discard", tile: "dg" }));

    expect(next.claimOffer).toBeNull();
    expect(next.pendingBotSeats).toEqual([2, 3]);
  });

  it("offers every legal chi even when declining may preserve a flexible wait", () => {
    const match = createPracticeMatch("avoid-useless-chi");
    const claimable = {
      ...match,
      wall: ["we", "ws", "ww", ...match.wall],
      players: [
        { ...match.players[0], hand: ["m2", "m3", "m5", "m6", "m7", "p2", "p3", "p4", "s2", "s3", "s4", "dr", "dr", "dg"] },
        { ...match.players[1], hand: ["m1", "m1", "m1", "p1", "p1", "p1", "s1", "s1", "s1", "we", "we", "we", "ws"] },
        { ...match.players[2], hand: ["m9", "m9", "m9", "p9", "p9", "p9", "s9", "s9", "s9", "ww", "ww", "ww", "wn"] },
        { ...match.players[3], hand: ["m1", "m1", "m1", "p1", "p1", "p1", "s1", "s1", "s1", "we", "we", "we", "m4"] },
      ] as typeof match.players,
    };

    const afterPlayer = resolvePracticeAction(claimable, { type: "discard", tile: "dg" });
    const afterBo = advancePracticeBotTurn(afterPlayer);
    const afterChen = advancePracticeBotTurn(afterBo);
    const afterDewi = advancePracticeBotTurn(afterChen);

    expect(afterDewi.claimOffer?.actions).toEqual(["chi"]);
    expect(afterDewi.turnSeat).toBe(0);
    expect(afterDewi.players[3].discards.at(-1)).toBe("m4");
  });
  it("detects seven pairs as a basic practice win", () => {
    expect(isWinningCodes(["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"])).toBe(
      true,
    );
  });

  it("adapts practice state to the existing match view", () => {
    const view = practiceToMatchView(createPracticeMatch("adapter"));

    expect(view.legalActions).toContain("discard");
    expect(view.legalActions).not.toContain("chi");
    expect(view.legalActions).not.toContain("pong");
    expect(view.legalActions).not.toContain("kong");
    expect(view.myHand).toHaveLength(14);
    expect(view.players).toHaveLength(4);
  });

  it("does not prearrange AI practice as a discard-9M instant win lesson", () => {
    const match = createPracticeMatch("practice-win-path");
    expect(match.players[0].hand).not.toEqual([
      "m1",
      "m1",
      "m2",
      "m2",
      "m3",
      "m3",
      "p4",
      "p4",
      "p5",
      "p5",
      "s6",
      "s6",
      "dr",
      "m9",
    ]);

    const queued = resolvePracticeAction(match, { type: "discard", tile: match.players[0].hand[0] });
    const next = advancePracticeBotTurn(advancePracticeBotTurn(advancePracticeBotTurn(queued)));

    expect(practiceToMatchView(next).legalActions).toContain("discard");
  });

  it("scripts tutorial opportunities in order: chi, pong, kong, then win", () => {
    const chi = createTutorialMatch();

    expect(practiceToMatchView(chi).legalActions).toEqual(["chi"]);

    const pong = resolvePracticeAction(chi, { type: "chi" });
    expect(practiceToMatchView(pong).legalActions).toEqual(["pong"]);

    const kong = resolvePracticeAction(pong, { type: "pong" });
    expect(practiceToMatchView(kong).legalActions).toEqual(["kong"]);

    const win = resolvePracticeAction(kong, { type: "kong" });
    expect(practiceToMatchView(win).legalActions).toEqual(["win"]);

    const standardWin = resolvePracticeAction(win, { type: "win" });
    expect(practiceToMatchView(standardWin).legalActions).toEqual(["win"]);
    expect(standardWin.handNumber).toBe(2);
    expect(standardWin.eventLog.at(-1)).toContain("Scenario 2");

    const complete = resolvePracticeAction(standardWin, { type: "win" });
    expect(complete.phase).toBe("complete");
    expect(complete.winnerSeat).toBe(0);
  });

  it("limits AI practice claim windows to the available claim action", () => {
    const match = createPracticeMatch("claim-window");
    const claimState = {
      ...match,
      claimOffer: {
        actions: ["pong" as const],
        tile: "p5",
        fromSeat: 1 as const,
        prompt: "Bo Bot discarded 5P. Pong is available.",
      },
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m1", "m2", "m3"] },
        ...match.players.slice(1),
      ] as typeof match.players,
    };

    expect(practiceToMatchView(claimState).legalActions).toEqual(["pong"]);

    const claimed = resolvePracticeAction(claimState, { type: "pong" });
    expect(claimed.claimOffer).toBeNull();
    expect(claimed.players[0].melds).toContain("pung p5");
    expect(claimed.players[0].hand.filter((tile) => tile === "p5")).toHaveLength(0);
    expect(practiceToMatchView(claimed).legalActions).toEqual(["discard"]);
  });

  it("does not advance queued bots while a player claim offer is pending", () => {
    const match = createPracticeMatch("claim-pause");
    const claimState = {
      ...match,
      turnSeat: 0 as const,
      pendingBotSeats: [2 as const, 3 as const],
      claimOffer: {
        actions: ["pong" as const],
        tile: "p5",
        fromSeat: 1 as const,
        prompt: "Bo Bot discarded P5. Pong is available.",
        tilesByAction: { pong: ["p5", "p5", "p5"] as [string, string, string] },
      },
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dg"] },
        { ...match.players[1], discards: ["p5"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const next = advancePracticeBotTurn(claimState);

    expect(next.claimOffer?.actions).toEqual(["pong"]);
    expect(next.pendingBotSeats).toEqual([2, 3]);
    expect(next.players[2].discards).toEqual(match.players[2].discards);
    expect(practiceToMatchView(next).legalActions).toEqual(["pong"]);
  });

  it("pauses AI practice when a bot discard creates a claim opportunity", () => {
    const match = createPracticeMatch("claim-generated");
    const claimable = {
      ...match,
      wall: ["s8", ...match.wall],
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m9", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dg"] },
        { ...match.players[1], hand: ["p5", "p6", "p7", "p8", "p9", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const next = advancePracticeBotTurn(resolvePracticeAction(claimable, { type: "discard", tile: "m9" }));

    expect(next.claimOffer?.actions).toEqual(["pong"]);
    expect(next.claimOffer?.tile).toBe("p5");
    expect(practiceToMatchView(next).legalActions).toEqual(["pong"]);
  });

  it("resolves a displayed chi offer into a meld", () => {
    const match = createPracticeMatch("chi-offer");
    const claimState = {
      ...match,
      claimOffer: {
        actions: ["chi" as const],
        tile: "p4",
        fromSeat: 3 as const,
        prompt: "Dewi Bot discarded P4. CHI is available.",
        tilesByAction: { chi: ["p2", "p3", "p4"] as [string, string, string] },
      },
      players: [
        { ...match.players[0], hand: ["m4", "m6", "m6", "m6", "p1", "p2", "p3", "p5", "s3", "s4", "s6", "we", "ww"] },
        match.players[1],
        match.players[2],
        { ...match.players[3], discards: ["p4"] },
      ] as typeof match.players,
    };

    const claimed = resolvePracticeAction(claimState, { type: "chi" });

    expect(claimed.claimOffer).toBeNull();
    expect(claimed.players[0].melds).toContain("chow p2 p3 p4");
    expect(practiceToMatchView(claimed).legalActions).toEqual(["discard"]);
  });

  it("resolves a displayed pong offer into a meld and returns discard control", () => {
    const match = createPracticeMatch("pong-offer");
    const claimState = {
      ...match,
      claimOffer: {
        actions: ["pong" as const],
        tile: "m8",
        fromSeat: 2 as const,
        prompt: "Chen Bot discarded M8. PONG is available.",
        tilesByAction: { pong: ["m8", "m8", "m8"] as [string, string, string] },
      },
      players: [
        { ...match.players[0], hand: ["m2", "m3", "m3", "m7", "m8", "m8", "m9", "p2", "p3", "p9", "p9", "s3", "s4"] },
        match.players[1],
        { ...match.players[2], discards: ["m8"] },
        match.players[3],
      ] as typeof match.players,
    };

    expect(practiceToMatchView(claimState).legalActions).toEqual(["pong"]);

    const claimed = resolvePracticeAction(claimState, { type: "pong" });

    expect(claimed.claimOffer).toBeNull();
    expect(claimed.players[0].melds).toContain("pung m8");
    expect(claimed.players[0].hand.filter((tile) => tile === "m8")).toHaveLength(0);
    expect(practiceToMatchView(claimed).legalActions).toEqual(["discard"]);
  });
});
