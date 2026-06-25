import { Button, TableCard } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import { Gamepad2, Lock, Plus, Router, Send, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { bankrollReserveFor } from "@mahjong/shared-types";
import type { LocaleCode, Profile, PublicTable, TableConfig } from "@mahjong/shared-types";
import type { DiscordActivityState } from "../discord/discordActivity";
import type { TelegramMiniAppState } from "../telegram/telegramMiniApp";
import { defaultTableConfig } from "../mock/mockData";
import { TurnstileWidget } from "../turnstile/TurnstileWidget";

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

export function PlayTablesHub({
  discordActivity,
  lanWebUrl,
  locale,
  profile,
  telegramMiniApp,
  tables,
  onCreate,
  onDiscordRoom,
  onDiscordSignIn,
  onFriendHost,
  onFriendJoin,
  onJoin,
}: {
  discordActivity: DiscordActivityState;
  lanWebUrl?: string | null;
  locale: LocaleCode;
  profile: Profile;
  telegramMiniApp: TelegramMiniAppState;
  tables: PublicTable[];
  onCreate: () => void;
  onDiscordRoom: (displayName: string, turnstileToken: string) => void;
  onDiscordSignIn: () => void;
  onFriendHost: (displayName: string, turnstileToken: string) => void;
  onFriendJoin: (roomCode: string, displayName: string) => void;
  onJoin: (config: TableConfig) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [joinCode, setJoinCode] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "",
  );
  const safeName = displayName.trim() || profile.displayName;
  const canUseDiscordRoom = discordActivity.status === "ready" || discordActivity.status === "authenticated";
  const roomCreationBlocked = Boolean(turnstileSiteKey && !turnstileToken);

  function consumeTurnstileToken(): string | null {
    if (roomCreationBlocked) return null;
    const token = turnstileToken ?? "";
    setTurnstileToken(null);
    setTurnstileResetKey((key) => key + 1);
    return token;
  }

  function hostFriendRoom() {
    const token = consumeTurnstileToken();
    if (token !== null) onFriendHost(safeName, token);
  }

  function openDiscordRoom() {
    const token = consumeTurnstileToken();
    if (token !== null) onDiscordRoom(safeName, token);
  }

  useEffect(() => {
    setDisplayName(profile.displayName);
  }, [profile.displayName]);

  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "play.title")}</h1>
          <p>{t(locale, "play.subtitle")}</p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={18} />
          {t(locale, "play.create")}
        </Button>
      </div>

      {turnstileSiteKey ? (
        <div className="turnstile-gate turnstile-gate-rooms">
          <TurnstileWidget
            action="room_create"
            ariaLabel="Verify room creation"
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
            siteKey={turnstileSiteKey}
          />
        </div>
      ) : null}

      <div className="friend-room-grid">
        <TableCard
          title={t(locale, "play.friendRoom")}
          meta={t(locale, "play.friendRoomBody")}
          action={
            <Button disabled={roomCreationBlocked} onClick={hostFriendRoom}>
              <Gamepad2 size={18} />
              {t(locale, "play.hostFriendRoom")}
            </Button>
          }
        >
          <div className="friend-room-controls">
            <label>
              <span>{t(locale, "play.displayName")}</span>
              <input
                aria-label={t(locale, "play.displayName")}
                maxLength={18}
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>
            <label>
              <span>{t(locale, "play.roomCode")}</span>
              <input
                aria-label={t(locale, "play.roomCode")}
                maxLength={8}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="JADE42"
                value={joinCode}
              />
            </label>
            <Button
              disabled={!joinCode.trim()}
              tone="secondary"
              onClick={() => {
                if (joinCode.trim()) {
                  onFriendJoin(joinCode.trim(), safeName);
                }
              }}
            >
              {t(locale, "play.joinFriendRoom")}
            </Button>
          </div>
          <p className="friend-room-note">{lanWebUrl ? `${t(locale, "play.friendUrl")} ${lanWebUrl}` : t(locale, "play.friendRoomHint")}</p>
        </TableCard>

        <TableCard
          title={t(locale, "play.discordRoom")}
          meta={discordStatusText(locale, discordActivity)}
          action={
            discordActivity.status === "ready" ? (
              <Button tone="secondary" onClick={onDiscordSignIn}>
                {t(locale, "play.discordSignIn")}
              </Button>
            ) : discordActivity.status === "authenticated" ? (
              <Button disabled={roomCreationBlocked} onClick={openDiscordRoom}>{t(locale, "play.discordJoin")}</Button>
            ) : discordActivity.status === "authenticating" ? (
              <Button disabled tone="secondary">
                {t(locale, "play.discordSigningIn")}
              </Button>
            ) : (
              <Button disabled tone="ghost">
                {t(locale, "play.discordUnavailable")}
              </Button>
            )
          }
        >
          <div className="table-meta-row">
            <span>
              <Router size={16} />
              {canUseDiscordRoom
                ? `${discordActivity.participantCount || 1} ${t(locale, "play.discordParticipants")}`
                : t(locale, "play.discordLaunchHint")}
            </span>
          </div>
          {discordActivity.error ? <p className="friend-room-warning">{discordActivity.error}</p> : null}
        </TableCard>

        <TableCard
          title={t(locale, "play.telegramRoom")}
          meta={telegramStatusText(locale, telegramMiniApp)}
          action={
            <Button disabled tone={telegramMiniApp.status === "ready" ? "secondary" : "ghost"}>
              {telegramMiniApp.status === "ready" ? t(locale, "play.telegramReadyButton") : t(locale, "play.telegramUnavailable")}
            </Button>
          }
        >
          <div className="table-meta-row">
            <span>
              <Send size={16} />
              {telegramMiniApp.status === "ready"
                ? t(locale, "play.telegramLaunchReady")
                : t(locale, "play.telegramLaunchHint")}
            </span>
          </div>
          {telegramMiniApp.error ? <p className="friend-room-warning">{telegramMiniApp.error}</p> : null}
        </TableCard>
      </div>

      <div className="table-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            title={table.title}
            meta={`${tableModeLabel(table.mode)} - ${table.host}`}
            action={
              <Button
                tone={table.tableType === "coin" ? "secondary" : "primary"}
                onClick={() =>
                  onJoin({
                    ...defaultTableConfig,
                    mode: table.mode,
                    tableType: table.tableType,
                    privacy: "public",
                    buyIn: table.buyIn,
                    maxPlayers: 4,
                  })
                }
              >
                {t(locale, "common.join")}
              </Button>
            }
          >
            <div className="table-meta-row">
              <span>
                <Users size={16} />
                {table.seatsTaken}/{table.maxPlayers}
              </span>
              <span>
                <Lock size={16} />
                {table.tableType === "coin"
                  ? `${table.buyIn.toLocaleString()} base - ${bankrollReserveFor(table).toLocaleString()} reserve`
                  : "Friendly"}
              </span>
            </div>
          </TableCard>
        ))}
      </div>
    </div>
  );
}

function telegramStatusText(locale: LocaleCode, telegramMiniApp: TelegramMiniAppState): string {
  if (telegramMiniApp.status === "ready" && telegramMiniApp.user) {
    return `${t(locale, "play.telegramDetected")} ${telegramMiniApp.user.displayName}`;
  }
  if (telegramMiniApp.status === "ready") {
    return t(locale, "play.telegramReady");
  }
  if (telegramMiniApp.status === "error") {
    return telegramMiniApp.error ?? t(locale, "play.telegramUnavailable");
  }
  return t(locale, "play.telegramLaunchHint");
}

function discordStatusText(locale: LocaleCode, discordActivity: DiscordActivityState): string {
  if (discordActivity.status === "authenticated" && discordActivity.user) {
    return `${t(locale, "play.discordSignedIn")} ${discordActivity.user.displayName}`;
  }
  if (discordActivity.status === "ready") {
    return t(locale, "play.discordReady");
  }
  if (discordActivity.status === "authenticating") {
    return t(locale, "play.discordSigningIn");
  }
  if (discordActivity.status === "missing-client-id" || discordActivity.status === "error") {
    return discordActivity.error ?? t(locale, "play.discordUnavailable");
  }
  return t(locale, "play.discordLaunchHint");
}

function tableModeLabel(mode: PublicTable["mode"]): string {
  if (mode === "riichi") {
    return "Riichi Beta";
  }
  return mode === "3-fan" ? "Old Hong Kong 3 Fan" : "Old Hong Kong 1 Fan";
}

