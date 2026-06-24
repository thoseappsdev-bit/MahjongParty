import type { LanJoinResponse, LanRoomSnapshot, MatchIntent, Profile, TableConfig } from "@mahjong/shared-types";
import { isDiscordActivityLaunch } from "../discord/discordActivity";
import { authHeaders } from "../auth/authToken";

export interface LanSession {
  roomCode: string;
  seat: 0 | 1 | 2 | 3;
  userId: string;
}

export interface LanHealth {
  ok: boolean;
  service: string;
  apiUrls?: string[];
  webUrls?: string[];
  roomRuntime?: string;
}

export function defaultLanApiBase(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8787";
  }

  return resolveLanApiBase(window.location, import.meta.env.PROD);
}

export function resolveLanApiBase(
  location: Pick<Location, "hostname" | "protocol" | "search">,
  isProductionBuild: boolean,
): string {
  if (isProductionBuild || isDiscordActivityLaunch(location.search)) {
    return "";
  }

  return `${location.protocol}//${location.hostname}:8787`;
}

export async function createLanRoom(
  apiBase: string,
  config: TableConfig,
  profile: Profile,
  turnstileToken: string,
): Promise<LanJoinResponse> {
  return postJson(apiUrl(apiBase, "/api/rooms"), {
    config,
    userId: profile.userId,
    displayName: profile.displayName,
    avatar: profile.avatar,
  }, turnstileToken);
}

export async function getLanHealth(apiBase: string): Promise<LanHealth> {
  const response = await fetch(apiUrl(apiBase, "/health"));
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return response.json();
}

export async function joinDiscordActivityRoom(
  apiBase: string,
  input: { instanceId: string; config: TableConfig; profile: Profile },
  turnstileToken: string,
): Promise<LanJoinResponse> {
  return postJson(apiUrl(apiBase, "/api/discord/rooms"), {
    instanceId: input.instanceId,
    config: input.config,
    userId: input.profile.userId,
    displayName: input.profile.displayName,
    avatar: input.profile.avatar,
  }, turnstileToken);
}

export async function joinLanRoom(apiBase: string, roomCode: string, profile: Profile): Promise<LanJoinResponse> {
  return postJson(apiUrl(apiBase, `/api/rooms/${roomCode}/join`), {
    userId: `${profile.userId}_${Math.random().toString(36).slice(2, 6)}`,
    displayName: profile.displayName,
    avatar: profile.avatar,
  });
}

export async function getLanRoom(apiBase: string, session: LanSession): Promise<LanRoomSnapshot> {
  const params = new URLSearchParams({ seat: String(session.seat), userId: session.userId });
  const response = await fetch(apiUrl(apiBase, `/api/rooms/${session.roomCode}?${params}`), {
    headers: { "x-user-id": session.userId, ...authHeaders() },
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return response.json();
}

export async function startLanMatch(apiBase: string, session: LanSession): Promise<LanRoomSnapshot> {
  const response = await postJson<LanRoomSnapshot>(apiUrl(apiBase, `/api/rooms/${session.roomCode}/start`), {
    userId: session.userId,
  });
  return getLanRoom(apiBase, { ...session, roomCode: response.roomCode });
}

export async function rematchLanRoom(apiBase: string, session: LanSession): Promise<LanRoomSnapshot> {
  const response = await postJson<LanRoomSnapshot>(apiUrl(apiBase, `/api/rooms/${session.roomCode}/rematch`), {
    userId: session.userId,
  });
  return getLanRoom(apiBase, { ...session, roomCode: response.roomCode });
}

export async function leaveLanRoom(apiBase: string, session: LanSession): Promise<LanRoomSnapshot> {
  return postJson(apiUrl(apiBase, `/api/rooms/${session.roomCode}/leave`), {
    userId: session.userId,
  });
}

export async function submitLanAction(apiBase: string, session: LanSession, intent: MatchIntent): Promise<LanRoomSnapshot> {
  return postJson(apiUrl(apiBase, `/api/rooms/${session.roomCode}/actions`), {
    seat: session.seat,
    userId: session.userId,
    intent,
  });
}

function apiUrl(apiBase: string, path: string): string {
  if (apiBase) {
    return `${apiBase}${path}`;
  }

  return path === "/health" ? "/api/health" : path;
}

async function postJson<T>(url: string, body: unknown, turnstileToken?: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
      ...(turnstileToken !== undefined ? { "x-turnstile-token": turnstileToken } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return response.json();
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
