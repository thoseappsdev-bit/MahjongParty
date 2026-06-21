import type { MatchView, Seat } from "@mahjong/shared-types";

export type PixiBoardVisualEvent =
  | { type: "discard"; seat: Seat; tile: string }
  | { type: "draw"; seat: Seat }
  | { type: "claim"; seat: Seat }
  | { type: "kong"; seat: Seat }
  | { type: "win"; seat: Seat }
  | { type: "turn"; seat: Seat };

const seats = [0, 1, 2, 3] as const satisfies readonly Seat[];

export function classifyPixiBoardEvents(previous: MatchView | null, current: MatchView): PixiBoardVisualEvent[] {
  if (previous === null) {
    return [];
  }

  return [...structuralEvents(previous, current), ...textFallbackEvents(previous, current)];
}

function structuralEvents(previous: MatchView, current: MatchView): PixiBoardVisualEvent[] {
  const events: PixiBoardVisualEvent[] = [];

  for (const seat of seats) {
    const previousPlayer = previous.players[seat];
    const currentPlayer = current.players[seat];

    if (currentPlayer.discards.length > previousPlayer.discards.length) {
      for (const tile of currentPlayer.discards.slice(previousPlayer.discards.length)) {
        events.push({ type: "discard", seat, tile });
      }
    }

    if (currentPlayer.handCount > previousPlayer.handCount) {
      events.push({ type: "draw", seat });
    }
  }

  if (previous.claimPrompt === null && current.claimPrompt !== null) {
    events.push({ type: "claim", seat: current.turnSeat });
  }

  if (previous.turnSeat !== current.turnSeat) {
    events.push({ type: "turn", seat: current.turnSeat });
  }

  return events;
}

function textFallbackEvents(previous: MatchView, current: MatchView): PixiBoardVisualEvent[] {
  if (current.recentEvent === previous.recentEvent) {
    return [];
  }

  const text = current.recentEvent;
  const seat = seatFromText(current, text) ?? current.turnSeat;
  const events: PixiBoardVisualEvent[] = [];

  if (/\bkong\b/i.test(text)) {
    events.push({ type: "kong", seat });
  }

  if (/\bwins\b/i.test(text)) {
    events.push({ type: "win", seat });
  }

  return events;
}

function seatFromText(view: MatchView, text: string): Seat | null {
  const normalizedText = text.toLocaleLowerCase();
  const player = view.players.find((candidate) => normalizedText.includes(candidate.name.toLocaleLowerCase()));
  return player?.seat ?? null;
}
