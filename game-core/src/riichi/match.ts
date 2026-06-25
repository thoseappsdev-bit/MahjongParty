import { createRiichiMatchState } from "./engine";
import { scoreRiichiHand, settleRiichiWin } from "./scoring";
import { isRiichiTile, type RiichiHonor } from "./tiles";
import type { RiichiMatchContext, RiichiMatchState, RiichiSeat } from "./types";
import { isTenpai } from "./waits";

const seats = [0, 1, 2, 3] as const;
const umaByRank = [15, 5, -5, -15] as const;

export type RiichiHandResult =
  | {
      kind: "win";
      winnerSeat: RiichiSeat;
      deltas: [number, number, number, number];
      riichiDeposits?: RiichiSeat[];
    }
  | {
      kind: "exhaustive-draw";
      tenpaiSeats: RiichiSeat[];
      riichiDeposits?: RiichiSeat[];
    };

export interface RiichiStanding {
  seat: RiichiSeat;
  name: string;
  points: number;
  rank: number;
  uma: number;
  total: number;
}

export function settleTenpaiNoten(tenpaiSeats: readonly RiichiSeat[]): [number, number, number, number] {
  const tenpai = new Set<RiichiSeat>(tenpaiSeats);
  if (tenpai.size === 0 || tenpai.size === seats.length) return [0, 0, 0, 0];

  const notenCount = seats.length - tenpai.size;
  const tenpaiGain = 3000 / tenpai.size;
  const notenLoss = 3000 / notenCount;

  return seats.map((seat) => (tenpai.has(seat) ? tenpaiGain : -notenLoss)) as [number, number, number, number];
}

export function riichiHandResultFromState(state: RiichiMatchState): RiichiHandResult | null {
  if (state.phase !== "complete") return null;
  const terminalEvent = [...state.auditLog].reverse().find((event) => event.action.type === "win" || event.action.type === "exhaustive-draw");
  if (!terminalEvent) return null;

  if (terminalEvent.action.type === "exhaustive-draw") {
    return {
      kind: "exhaustive-draw",
      tenpaiSeats: seats.filter((seat) => {
        try {
          return isTenpai(state.players[seat].hand, state.players[seat].melds);
        } catch {
          return false;
        }
      }),
      riichiDeposits: [],
    };
  }

  if (typeof terminalEvent.action.actorSeat !== "number") return null;
  const winnerSeat = terminalEvent.action.actorSeat as RiichiSeat;
  const winner = state.players[winnerSeat];
  const eventTile = terminalEvent.action.payload?.tile;
  const winningTile = typeof eventTile === "string" && isRiichiTile(eventTile) ? eventTile : winner.hand.at(-1);
  if (!winningTile) return null;

  const score = scoreRiichiHand({
    hand: winner.hand,
    melds: winner.melds,
    winningTile,
    winBy: "tsumo",
    riichi: winner.riichi,
    doubleRiichi: winner.doubleRiichi,
    ippatsu: winner.ippatsu,
    doraIndicators: state.doraIndicators,
    uraDoraIndicators: state.uraDoraIndicators,
    seatWind: seatWindFor(winnerSeat),
    roundWind: state.context.roundWind,
  });
  if (!score.legal) return null;

  return {
    kind: "win",
    winnerSeat,
    deltas: settleRiichiWin(score, {
      winnerSeat,
      winBy: "tsumo",
      dealerSeat: state.context.dealerSeat,
      honba: state.context.honba,
      riichiSticks: state.context.riichiSticks,
    }),
    riichiDeposits: [],
  };
}

export function advanceCompletedRiichiHand(state: RiichiMatchState): RiichiMatchState {
  const result = riichiHandResultFromState(state);
  return result ? advanceRiichiRound(state, result) : state;
}

export function advanceRiichiRound(state: RiichiMatchState, result: RiichiHandResult): RiichiMatchState {
  const riichiDeposits = result.riichiDeposits ?? [];
  const deltas = result.kind === "win" ? [...result.deltas] : settleTenpaiNoten(result.tenpaiSeats);

  if (result.kind === "win" && sum(deltas) === 0 && state.context.riichiSticks > 0) {
    deltas[result.winnerSeat] += state.context.riichiSticks * 1000;
  }

  const players = state.players.map((player) => ({
    ...player,
    points: player.points + deltas[player.seat] - (riichiDeposits.includes(player.seat) ? 1000 : 0),
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    furiten: "none" as const,
  })) as RiichiMatchState["players"];

  const dealerContinues =
    result.kind === "win"
      ? result.winnerSeat === state.context.dealerSeat
      : new Set(result.tenpaiSeats).has(state.context.dealerSeat);

  const context = nextContext(state.context, dealerContinues, result.kind, riichiDeposits.length);
  const complete = isAfterSouthFour(state.context, dealerContinues);
  const eventLog = [...state.eventLog, result.kind === "win" ? `Seat ${result.winnerSeat} won the hand.` : "The hand ended in exhaustive draw."];

  if (complete) {
    return {
      ...state,
      phase: "complete",
      context,
      turnSeat: context.dealerSeat,
      players,
      claimWindow: null,
      result: null,
      eventLog,
    };
  }

  const nextHand = createRiichiMatchState(nextHandSeed(state, context), {
    playerNames: players.map((player) => player.name) as [string, string, string, string],
    dealerSeat: context.dealerSeat,
  });
  return {
    ...nextHand,
    context,
    turnSeat: context.dealerSeat,
    players: nextHand.players.map((player) => {
      const settled = players[player.seat];
      return {
        ...player,
        name: settled.name,
        avatar: settled.avatar,
        points: settled.points,
        isBot: settled.isBot,
      };
    }) as RiichiMatchState["players"],
    eventLog: [...eventLog, `Next Riichi hand: ${roundLabel(context)}.`],
    auditLog: [...state.auditLog],
  };
}

export function finalizeHanchan(state: RiichiMatchState): RiichiStanding[] {
  const sorted = [...state.players].sort((left, right) => right.points - left.points || left.seat - right.seat);
  const standings: RiichiStanding[] = [];

  for (let index = 0; index < sorted.length; ) {
    const tied = sorted.filter((player) => player.points === sorted[index].points);
    const firstTieIndex = index;
    const rank = firstTieIndex + 1;
    const uma = tied.reduce((total, _player, offset) => total + umaByRank[firstTieIndex + offset], 0) / tied.length;

    for (const player of tied) {
      const baseScore = (player.points - 30000) / 1000;
      standings.push({ seat: player.seat, name: player.name, points: player.points, rank, uma, total: baseScore + uma });
    }

    index += tied.length;
  }

  return standings.sort((left, right) => left.rank - right.rank || right.points - left.points || left.seat - right.seat);
}

function nextContext(context: RiichiMatchContext, dealerContinues: boolean, resultKind: RiichiHandResult["kind"], depositCount: number): RiichiMatchContext {
  const riichiSticks = resultKind === "win" ? depositCount : context.riichiSticks + depositCount;
  if (dealerContinues) {
    return { ...context, honba: context.honba + 1, riichiSticks };
  }

  const nextDealerSeat = ((context.dealerSeat + 1) % 4) as RiichiSeat;
  const nextHandNumber = context.handNumber + 1;
  if (nextHandNumber <= 4) {
    return {
      ...context,
      dealerSeat: nextDealerSeat,
      handNumber: nextHandNumber,
      honba: resultKind === "win" ? 0 : context.honba + 1,
      riichiSticks,
    };
  }

  return {
    ...context,
    roundWind: context.roundWind === "we" ? "ws" : context.roundWind,
    handNumber: 1,
    dealerSeat: nextDealerSeat,
    honba: resultKind === "win" ? 0 : context.honba + 1,
    riichiSticks,
  };
}

function isAfterSouthFour(context: RiichiMatchContext, dealerContinues: boolean): boolean {
  return context.roundWind === "ws" && context.handNumber === 4 && !dealerContinues;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function seatWindFor(seat: RiichiSeat): RiichiHonor {
  return (["we", "ws", "ww", "wn"] as const)[seat];
}

function nextHandSeed(state: RiichiMatchState, context: RiichiMatchContext): string {
  return `${state.seed}-${context.roundWind}-${context.handNumber}-${state.auditLog.length + 1}`;
}

function roundLabel(context: RiichiMatchContext): string {
  const wind = context.roundWind === "we" ? "East" : "South";
  return `${wind} ${context.handNumber}, honba ${context.honba}`;
}
