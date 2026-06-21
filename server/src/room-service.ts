import { appendMatchEvent, replayMatchEvents, type MatchAction, type MatchEvent } from "@mahjong/game-core";

export interface RoomSeat {
  seat: number;
  userId: string | null;
  displayName: string | null;
  avatar: string | null;
  ready: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  seats: [RoomSeat, RoomSeat, RoomSeat, RoomSeat];
  events: MatchEvent[];
}

export interface RoomServiceOptions {
  now: () => number | string;
  code: () => string;
}

export interface CreateRoomInput {
  hostUserId: string;
  displayName: string;
  avatar: string;
}

export interface JoinRoomInput {
  userId: string;
  displayName: string;
  avatar: string;
}

export interface SubmitActionInput {
  seat: number;
  type: string;
  payload?: Record<string, string | number | boolean | null>;
  clientActionId?: string;
}

type RoomEventAction =
  | MatchAction<{ userId: string; displayName: string; avatar: string }>
  | MatchAction<Record<string, string | number | boolean | null>>;

const emptySeats = (): RoomSnapshot["seats"] =>
  [0, 1, 2, 3].map((seat) => ({
    seat,
    userId: null,
    displayName: null,
    avatar: null,
    ready: false,
  })) as RoomSnapshot["seats"];

export function createRoomService(options: RoomServiceOptions) {
  const rooms = new Map<string, RoomSnapshot>();

  function createRoom(input: CreateRoomInput): RoomSnapshot {
    const roomCode = options.code();
    const base: RoomSnapshot = { roomCode, seats: emptySeats(), events: [] };
    base.seats[0] = seatFromUser(0, input.hostUserId, input.displayName, input.avatar);
    base.events = appendRoomEvent(base.events, options.now(), {
      type: "room.created",
      actorSeat: 0,
      payload: { userId: input.hostUserId, displayName: input.displayName, avatar: input.avatar },
    });
    rooms.set(roomCode, cloneRoom(base));
    return cloneRoom(base);
  }

  function joinRoom(roomCode: string, input: JoinRoomInput): RoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    const seatIndex = room.seats.findIndex((seat) => seat.userId === null);
    if (seatIndex === -1) {
      throw new Error(`Room ${roomCode} is full`);
    }

    room.seats[seatIndex] = seatFromUser(seatIndex, input.userId, input.displayName, input.avatar);
    room.events = appendRoomEvent(room.events, options.now(), {
      type: "room.joined",
      actorSeat: seatIndex,
      payload: { userId: input.userId, displayName: input.displayName, avatar: input.avatar },
    });
    rooms.set(roomCode, cloneRoom(room));
    return cloneRoom(room);
  }

  function submitAction(roomCode: string, input: SubmitActionInput): RoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    room.events = appendRoomEvent(room.events, options.now(), {
      type: `match.${input.type}`,
      actorSeat: input.seat,
      clientActionId: input.clientActionId,
      payload: input.payload,
    });
    rooms.set(roomCode, cloneRoom(room));
    return cloneRoom(room);
  }

  function replayRoom(events: MatchEvent[]): RoomSnapshot {
    const initialRoom: RoomSnapshot = { roomCode: "REPLAY", seats: emptySeats(), events: [] };
    return replayMatchEvents(initialRoom, events, (room, event) => {
      const next = cloneRoom(room);
      next.events = [...next.events, event];
      if (event.action.type === "room.created" || event.action.type === "room.joined") {
        const payload = event.action.payload as { userId: string; displayName: string; avatar: string } | undefined;
        if (payload && typeof event.action.actorSeat === "number") {
          next.seats[event.action.actorSeat] = seatFromUser(
            event.action.actorSeat,
            payload.userId,
            payload.displayName,
            payload.avatar,
          );
        }
      }
      return next;
    });
  }

  return { createRoom, joinRoom, submitAction, replayRoom };
}

function appendRoomEvent(events: MatchEvent[], occurredAt: number | string, action: RoomEventAction): MatchEvent[] {
  return appendMatchEvent(events, { occurredAt, action, source: action.type.startsWith("match.") ? "player" : "system" });
}

function seatFromUser(seat: number, userId: string, displayName: string, avatar: string): RoomSeat {
  return { seat, userId, displayName, avatar, ready: true };
}

function requireRoom(rooms: Map<string, RoomSnapshot>, roomCode: string): RoomSnapshot {
  const room = rooms.get(roomCode);
  if (!room) {
    throw new Error(`Room ${roomCode} not found`);
  }
  return cloneRoom(room);
}

function cloneRoom(room: RoomSnapshot): RoomSnapshot {
  return {
    roomCode: room.roomCode,
    seats: room.seats.map((seat) => ({ ...seat })) as RoomSnapshot["seats"],
    events: room.events.map((event) => ({
      ...event,
      action: {
        ...event.action,
        payload: event.action.payload ? { ...event.action.payload } : undefined,
      },
      metadata: event.metadata ? { ...event.metadata } : undefined,
    })),
  };
}
