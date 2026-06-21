// Realtime room helpers shared by the Durable Object WebSocket adapter.
// Pure orchestration over the room service + disconnect tracker, so the
// reconnect / disconnect-to-bot / host-transfer behavior is unit-testable
// without a live WebSocket runtime.

import type { LanRoomSnapshot } from "@mahjong/shared-types";
import type { createLanTableService } from "./lan-table-service";
import { dueForBot, markConnected, type DisconnectMap } from "./disconnect-tracker";

type RoomService = ReturnType<typeof createLanTableService>;

export interface DisconnectGraceResult {
  map: DisconnectMap;
  bottedUserIds: string[];
  snapshot: LanRoomSnapshot | null;
}

/**
 * Converts every still-seated human whose grace window elapsed into a bot (which
 * also transfers the host via `leaveRoom`), then advances the bots so the table
 * keeps moving. Returns the updated grace map and a fresh snapshot.
 */
export function applyDisconnectGrace(
  service: RoomService,
  roomCode: string,
  map: DisconnectMap,
  now: number,
  graceMs: number,
): DisconnectGraceResult {
  const due = dueForBot(map, now, graceMs);
  let nextMap = map;
  let snapshot: LanRoomSnapshot | null = null;
  const bottedUserIds: string[] = [];

  for (const userId of due) {
    // Skip users who already left or reconnected on a different seat.
    if (service.seatOf(roomCode, userId) !== null) {
      snapshot = service.leaveRoom(roomCode, { userId });
      bottedUserIds.push(userId);
    }
    nextMap = markConnected(nextMap, userId);
  }

  if (bottedUserIds.length > 0) {
    snapshot = service.advanceBots(roomCode);
  }

  return { map: nextMap, bottedUserIds, snapshot };
}

export type SocketClientMessage =
  | { type: "action"; intent: { type: string; tile?: string } }
  | { type: "start" }
  | { type: "rematch" }
  | { type: "ping" };

/** Parses + validates an inbound socket frame. Throws on anything unexpected. */
export function parseSocketMessage(raw: string): SocketClientMessage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid socket message");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Invalid socket message");
  }
  const message = data as { type?: unknown; intent?: unknown };
  if (message.type === "start" || message.type === "rematch" || message.type === "ping") {
    return { type: message.type };
  }
  if (message.type === "action") {
    const intent = message.intent as { type?: unknown; tile?: unknown } | undefined;
    if (!intent || typeof intent.type !== "string") {
      throw new Error("action.intent.type is required");
    }
    return { type: "action", intent: { type: intent.type, ...(typeof intent.tile === "string" ? { tile: intent.tile } : {}) } };
  }
  throw new Error("Unsupported socket message type");
}
