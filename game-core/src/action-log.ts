export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type MatchAction<TPayload extends JsonObject = JsonObject> = {
  type: string;
  actorSeat?: number;
  payload?: TPayload;
  clientActionId?: string;
};

export type MatchEvent<TAction extends MatchAction = MatchAction> = {
  sequence: number;
  occurredAt: number | string;
  action: TAction;
  source?: "player" | "bot" | "system";
  metadata?: JsonObject;
};

export type MatchEventInput<TAction extends MatchAction = MatchAction> = Omit<MatchEvent<TAction>, "sequence">;

export function appendMatchEvent<TAction extends MatchAction>(
  log: readonly MatchEvent[],
  event: MatchEventInput<TAction>,
): MatchEvent[] {
  const lastSequence = log.reduce((highest, entry) => Math.max(highest, entry.sequence), 0);
  const nextEvent: MatchEvent<TAction> = { sequence: lastSequence + 1, ...event };
  return [...log, nextEvent];
}

export function replayMatchEvents<TState, TEvent extends MatchEvent>(
  initialState: TState,
  events: readonly TEvent[],
  reducer: (state: TState, event: TEvent) => TState,
): TState {
  let previousSequence = 0;
  let state = initialState;

  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1) {
      throw new Error(`Invalid sequence number: ${event.sequence}`);
    }
    if (event.sequence === previousSequence) {
      throw new Error(`Duplicate sequence number: ${event.sequence}`);
    }
    if (event.sequence < previousSequence) {
      throw new Error(`Out-of-order sequence number: ${event.sequence} after ${previousSequence}`);
    }

    previousSequence = event.sequence;
    state = reducer(state, event);
  }

  return state;
}
