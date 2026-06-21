import type { LanRoomSnapshot, MatchIntent } from "@mahjong/shared-types";
import { getAuthToken } from "../auth/authToken";
import type { LanSession } from "./lanClient";

export interface RoomSocketHandlers {
  onSnapshot: (snapshot: LanRoomSnapshot) => void;
  onOpen?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export interface RoomSocket {
  readonly socket: WebSocket;
  sendAction: (intent: MatchIntent) => void;
  start: () => void;
  rematch: () => void;
  close: () => void;
}

export function buildRoomSocketUrl(apiBase: string, session: LanSession, token: string | null): string {
  const params = new URLSearchParams({ seat: String(session.seat) });
  if (token) {
    params.set("token", token);
  } else {
    params.set("uid", session.userId);
  }
  const origin = apiBase || (typeof window !== "undefined" ? window.location.origin : "");
  const wsOrigin = origin.replace(/^http/i, "ws");
  return `${wsOrigin}/api/rooms/${session.roomCode}/socket?${params.toString()}`;
}

export function connectRoomSocket(apiBase: string, session: LanSession, handlers: RoomSocketHandlers): RoomSocket {
  const socket = new WebSocket(buildRoomSocketUrl(apiBase, session, getAuthToken()));

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data as string) as { type?: string; snapshot?: LanRoomSnapshot; error?: string };
      if (data.type === "snapshot" && data.snapshot) {
        handlers.onSnapshot(data.snapshot);
      } else if (data.type === "error" && data.error) {
        handlers.onError?.(data.error);
      }
    } catch {
      // ignore non-JSON frames (e.g. pong)
    }
  });
  socket.addEventListener("error", () => handlers.onError?.("Realtime connection error"));
  socket.addEventListener("close", () => handlers.onClose?.());

  const send = (payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  return {
    socket,
    sendAction: (intent) => send({ type: "action", intent }),
    start: () => send({ type: "start" }),
    rematch: () => send({ type: "rematch" }),
    close: () => socket.close(),
  };
}
