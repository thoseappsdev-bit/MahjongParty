import { Button, Panel } from "@mahjong/ui";
import { formatT, t } from "@mahjong/i18n";
import { Copy, LogOut, Play, ShieldCheck } from "lucide-react";
import type { LocaleCode, RoomLobbyState } from "@mahjong/shared-types";

export function WaitingRoom({
  activityLog = [],
  locale,
  room,
  onBack,
  onLeave,
  onCopy,
  onStart,
  canStart = true,
  shareHint,
  statusText,
}: {
  activityLog?: string[];
  locale: LocaleCode;
  room: RoomLobbyState;
  onBack: () => void;
  onLeave?: () => void;
  onCopy: () => void;
  onStart: () => void;
  canStart?: boolean;
  shareHint?: string | null;
  statusText?: string;
}) {
  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "waiting.title")}</h1>
          <p>{formatT(locale, "waiting.subtitle", { roomCode: room.roomCode })}</p>
        </div>
        <Button tone="ghost" onClick={onBack}>
          {t(locale, "common.edit")}
        </Button>
      </div>

      <Panel className="room-panel">
        <div className="room-code">
          <span>{room.roomCode}</span>
          <Button tone="secondary" onClick={onCopy}>
            <Copy size={18} />
            {t(locale, "common.share")}
          </Button>
        </div>
        {shareHint ? <p className="room-note">{shareHint}</p> : null}
        <div className="seat-grid">
          {room.seats.map((seat) => (
            <div className="seat-card" key={seat.seat}>
              <div className="avatar small">{seat.avatar}</div>
              <div>
                <strong>{seat.displayName}</strong>
                <span>
                  {seat.isBot
                    ? t(locale, "waiting.botFill")
                    : seat.userId === room.hostUserId
                      ? t(locale, "waiting.host")
                      : t(locale, "waiting.ready")}
                </span>
              </div>
              <ShieldCheck size={18} />
            </div>
          ))}
        </div>
        {statusText ? <p className="room-note">{statusText}</p> : null}
        {activityLog.length > 0 ? (
          <div className="room-activity" aria-label={t(locale, "waiting.activity")}>
            <strong>{t(locale, "waiting.activity")}</strong>
            {activityLog.slice(-4).map((entry, index) => (
              <span key={`${entry}-${index}`}>{entry}</span>
            ))}
          </div>
        ) : null}
        <div className="room-actions">
          <Button disabled={!canStart} onClick={onStart}>
            <Play size={18} />
            {t(locale, "waiting.start")}
          </Button>
          {onLeave ? (
            <Button tone="danger" onClick={onLeave}>
              <LogOut size={18} />
              {t(locale, "waiting.leave")}
            </Button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
