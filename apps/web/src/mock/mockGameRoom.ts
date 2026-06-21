import { advancePrototypeMatch, createPrototypeMatch } from "@mahjong/game-core";
import type { MatchIntent, MatchView, PlayerView, RoomLobbyState, Seat, TableConfig } from "@mahjong/shared-types";
import { defaultTableConfig, initialMatchView, lobby } from "./mockData";

const botDiscardCycle = ["m9", "p7", "s2", "dg", "wn", "m4", "p8", "s9"];

export function createRoom(config: TableConfig): RoomLobbyState {
  return {
    ...lobby,
    config,
    roomCode: config.tableType === "coin" ? "COIN88" : "JADE42",
  };
}

export function createPracticeRoom(): RoomLobbyState {
  return createRoom({
    ...defaultTableConfig,
    mode: "3-fan",
    tableType: "friendly",
    privacy: "private",
    buyIn: 0,
  });
}

export function startMatch(room: RoomLobbyState): MatchView {
  return createPrototypeMatch({
    ...initialMatchView,
    mode: room.config.mode,
    tableType: room.config.tableType,
    timerSeconds: room.config.timerSeconds,
    legalActions: ["chi", "pong", "kong", "win", "discard"],
  });
}

export function advanceMatch(view: MatchView, intent: MatchIntent): MatchView {
  if (intent.type === "discard") {
    return advanceAfterPlayerDiscard(view, intent.tile ?? view.myHand[0] ?? "m1");
  }

  if (intent.type === "emote") {
    return {
      ...view,
      recentEvent: "You sent a table emote.",
      claimPrompt: null,
    };
  }

  const next = advancePrototypeMatch(view);

  return {
    ...next,
    turnSeat: view.mySeat,
    legalActions: ["chi", "pong", "kong", "win", "discard"],
    claimPrompt: intent.type === "pong" ? "Pong claimed for the prototype." : null,
    recentEvent: `${labelIntent(intent.type)} sent. Your turn continues in prototype mode.`,
  };
}

function advanceAfterPlayerDiscard(view: MatchView, tile: string): MatchView {
  const handWithoutTile = removeFirstTile(view.myHand, tile);
  const players = view.players.map((player) => ({ ...player, discards: [...player.discards] })) as MatchView["players"];
  players[view.mySeat].discards.push(tile);
  players[view.mySeat] = {
    ...players[view.mySeat],
    handCount: Math.max(0, handWithoutTile.length),
  };

  const botEvents: string[] = [];
  for (const seat of [1, 2, 3] as Seat[]) {
    const discard = botDiscardFor(view, seat);
    players[seat] = discardForBot(players[seat], discard);
    botEvents.push(`${players[seat].name} discarded ${displayDiscard(discard)}`);
  }

  return {
    ...view,
    turnSeat: view.mySeat,
    timerSeconds: view.timerSeconds,
    wallCount: Math.max(0, view.wallCount - 4),
    claimPrompt: null,
    legalActions: ["chi", "pong", "kong", "win", "discard"],
    myHand: handWithoutTile,
    players,
    recentEvent: `${botEvents.join(". ")}. Your turn.`,
  };
}

function removeFirstTile(hand: string[], tile: string): string[] {
  const index = hand.indexOf(tile);

  if (index === -1) {
    return hand.slice(1);
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function discardForBot(player: PlayerView, tile: string): PlayerView {
  return {
    ...player,
    discards: [...player.discards, tile],
    handCount: Math.max(1, player.handCount - 1),
  };
}

function botDiscardFor(view: MatchView, seat: Seat): string {
  return botDiscardCycle[(view.wallCount + seat + view.players[seat].discards.length) % botDiscardCycle.length];
}

function labelIntent(action: MatchIntent["type"]): string {
  return {
    chi: "Chi",
    pong: "Pong",
    kong: "Kong",
    win: "Win",
    discard: "Discard",
    emote: "Emote",
    pass: "Pass",
  }[action];
}

function displayDiscard(tile: string): string {
  return tile.toUpperCase();
}
