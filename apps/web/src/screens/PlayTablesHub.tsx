import { Button, TableCard } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import { Gamepad2, Lock, Plus, Router, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { bankrollReserveFor } from "@mahjong/shared-types";
import type { LocaleCode, Profile, PublicTable, TableConfig } from "@mahjong/shared-types";
import type { DiscordActivityState } from "../discord/discordActivity";
import { defaultTableConfig } from "../mock/mockData";

export function PlayTablesHub({
  discordActivity,
  lanWebUrl,
  locale,
  profile,
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
  tables: PublicTable[];
  onCreate: () => void;
  onDiscordRoom: (displayName: string) => void;
  onDiscordSignIn: () => void;
  onFriendHost: (displayName: string) => void;
  onFriendJoin: (roomCode: string, displayName: string) => void;
  onJoin: (config: TableConfig) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [joinCode, setJoinCode] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "",
  );
  const safeName = displayName.trim() || profile.displayName;
  const canUseDiscordRoom = discordActivity.status === "ready" || discordActivity.status === "authenticated";

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

      <div className="friend-room-grid">
        <TableCard
          title={t(locale, "play.friendRoom")}
          meta={t(locale, "play.friendRoomBody")}
          action={
            <Button onClick={() => onFriendHost(safeName)}>
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
              <Button onClick={() => onDiscordRoom(safeName)}>{t(locale, "play.discordJoin")}</Button>
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
      </div>

      <div className="table-grid">
        {tables.map((table) => (
          <TableCard
            key={table.id}
            title={table.title}
            meta={`${table.mode === "3-fan" ? "Old Hong Kong 3 Fan" : "Old Hong Kong 1 Fan"} · ${table.host}`}
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
