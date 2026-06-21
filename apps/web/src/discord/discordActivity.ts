export type DiscordActivityStatus =
  | "unavailable"
  | "connecting"
  | "missing-client-id"
  | "ready"
  | "authenticating"
  | "authenticated"
  | "error";

export interface DiscordActivityUser {
  id: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
}

export interface DiscordActivityState {
  status: DiscordActivityStatus;
  instanceId: string | null;
  channelId: string | null;
  guildId: string | null;
  platform: string | null;
  participantCount: number;
  user: DiscordActivityUser | null;
  error: string | null;
}

export const discordActivityUnavailable: DiscordActivityState = {
  status: "unavailable",
  instanceId: null,
  channelId: null,
  guildId: null,
  platform: null,
  participantCount: 0,
  user: null,
  error: null,
};

interface DiscordSdkLike {
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  platform: unknown;
  ready: () => Promise<void>;
  commands: {
    authorize: (args: {
      client_id: string;
      response_type: "code";
      state: string;
      prompt: "none";
      scope: string[];
    }) => Promise<{ code: string }>;
    authenticate: (args: { access_token: string }) => Promise<{
      access_token: string;
      user: {
        id: string;
        username: string;
        discriminator: string;
        avatar?: string | null;
        global_name?: string | null;
      };
    } | null>;
    getInstanceConnectedParticipants: () => Promise<{ participants: unknown[] }>;
  };
}

let discordSdk: DiscordSdkLike | null = null;

export function isDiscordActivityLaunch(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  const params = new URLSearchParams(search);
  return Boolean(params.get("frame_id") && params.get("instance_id") && params.get("platform"));
}

export function discordRoomCode(instanceId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

export async function connectDiscordActivity(): Promise<DiscordActivityState> {
  if (!isDiscordActivityLaunch()) {
    return discordActivityUnavailable;
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    return {
      ...discordActivityUnavailable,
      status: "missing-client-id",
      error: "VITE_DISCORD_CLIENT_ID is required for Discord Activity mode.",
    };
  }

  try {
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    const sdk = new DiscordSDK(clientId) as DiscordSdkLike;
    discordSdk = sdk;
    const baseState: DiscordActivityState = {
      status: "ready",
      instanceId: sdk.instanceId,
      channelId: sdk.channelId,
      guildId: sdk.guildId,
      platform: String(sdk.platform),
      participantCount: 0,
      user: null,
      error: null,
    };

    await sdk.ready();
    const participants = await sdk.commands.getInstanceConnectedParticipants().catch(() => ({ participants: [] }));
    return { ...baseState, participantCount: participants.participants.length };
  } catch (error) {
    return {
      ...discordActivityUnavailable,
      status: "error",
      error: error instanceof Error ? error.message : "Discord Activity connection failed.",
    };
  }
}

export async function authenticateDiscordActivity(apiBase: string): Promise<DiscordActivityState> {
  const readyState = await connectDiscordActivity();
  if (readyState.status !== "ready" || !discordSdk) {
    return readyState;
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  try {
    const { code } = await discordSdk.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify"],
    });
    const tokenResponse = await fetch(apiUrl(apiBase, "/api/discord/token"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!tokenResponse.ok) {
      throw new Error(await responseError(tokenResponse));
    }

    const { access_token } = (await tokenResponse.json()) as { access_token: string };
    const auth = await discordSdk.commands.authenticate({ access_token });
    if (!auth) {
      throw new Error("Discord authenticate command failed");
    }

    return {
      ...readyState,
      status: "authenticated",
      user: discordUserFor(auth.user),
      error: null,
    };
  } catch (error) {
    return {
      ...readyState,
      status: "error",
      error: error instanceof Error ? error.message : "Discord sign-in failed.",
    };
  }
}

function discordUserFor(user: {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  global_name?: string | null;
}): DiscordActivityUser {
  const displayName = user.global_name ?? (user.discriminator === "0" ? user.username : `${user.username}#${user.discriminator}`);
  const defaultAvatarIndex = Number((BigInt(user.id) >> 22n) % 6n);
  return {
    id: user.id,
    displayName,
    avatar: displayName.slice(0, 1).toUpperCase() || "D",
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`,
  };
}

function apiUrl(apiBase: string, path: string): string {
  return apiBase ? `${apiBase}${path}` : path;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
