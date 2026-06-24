import type { RiichiMatchContext, RiichiMatchState, RiichiSeat } from "./types";

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

  return {
    ...state,
    phase: complete ? "complete" : "playing",
    context,
    turnSeat: context.dealerSeat,
    players,
    liveWall: [],
    deadWall: [],
    doraIndicators: [],
    uraDoraIndicators: [],
    kanDoraIndicators: [],
    claimWindow: null,
    result: null,
    eventLog: [...state.eventLog, result.kind === "win" ? `Seat ${result.winnerSeat} won the hand.` : "The hand ended in exhaustive draw."],
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
