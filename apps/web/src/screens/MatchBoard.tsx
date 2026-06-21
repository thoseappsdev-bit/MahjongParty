import { useState } from "react";
import { Panel } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import type { LocaleCode, MatchIntent, MatchView } from "@mahjong/shared-types";
import { BoardCanvas } from "./BoardCanvas";
import { PixiMatchBoard } from "./PixiMatchBoard";

export function MatchBoard({
  canDiscard,
  locale,
  tutorialScenarioBanner,
  view,
  onAction,
}: {
  canDiscard: boolean;
  locale: LocaleCode;
  tutorialScenarioBanner: string | null;
  view: MatchView;
  onAction: (intent: MatchIntent) => void;
}) {
  const [useFallbackBoard, setUseFallbackBoard] = useState(false);
  const localPlayer = view.players[view.mySeat];

  return (
    <Panel className={`mahjong-table ${useFallbackBoard ? "canvas-rendered" : "pixi-rendered"}`}>
      {useFallbackBoard ? (
        <LegacyMatchBoard
          canDiscard={canDiscard}
          locale={locale}
          tutorialScenarioBanner={tutorialScenarioBanner}
          view={view}
          onAction={onAction}
        />
      ) : (
        <>
          <PixiMatchBoard
            canDiscard={canDiscard}
            tutorialScenarioBanner={tutorialScenarioBanner}
            view={view}
            onAction={onAction}
            onRendererError={() => setUseFallbackBoard(true)}
          />
          <div className="sr-only-hand" aria-label={`${localPlayer.name} hand`}>
            {view.myHand.map((tile, index) => (
              <button
                disabled={!canDiscard}
                key={`${tile}-${index}`}
                type="button"
                onClick={() => {
                  if (canDiscard) {
                    onAction({ type: "discard", tile });
                  }
                }}
              >
                {t(locale, "match.discard")} {displayTile(tile)}
              </button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function LegacyMatchBoard({
  canDiscard,
  locale,
  tutorialScenarioBanner,
  view,
  onAction,
}: {
  canDiscard: boolean;
  locale: LocaleCode;
  tutorialScenarioBanner: string | null;
  view: MatchView;
  onAction: (intent: MatchIntent) => void;
}) {
  const localPlayer = view.players[view.mySeat];

  return (
    <>
      <BoardCanvas view={view} />
      <OpponentRail locale={locale} player={view.players[2]} position="top" />
      <OpponentRail locale={locale} player={view.players[1]} position="left" />
      <OpponentRail locale={locale} player={view.players[3]} position="right" />

      <div className="table-center">
        <div className="round-marker">{t(locale, "match.eastRound")}</div>
        <div className="discard-cloud">
          {view.players.flatMap((player) => player.discards).map((tile, index) => (
            <Tile key={`${tile}-${index}`} code={tile} compact />
          ))}
        </div>
        {view.claimPrompt ? <div className="claim-banner">{view.claimPrompt}</div> : null}
        {tutorialScenarioBanner ? <div className="claim-banner tutorial-scenario-banner">{tutorialScenarioBanner}</div> : null}
      </div>

      <div className="my-rail">
        <div className="player-strip">
          <div className="avatar small">{localPlayer.avatar}</div>
          <strong>{localPlayer.name}</strong>
          <span>
            {t(locale, "match.wind")} {localPlayer.wind}
          </span>
        </div>
        <MeldList melds={localPlayer.melds} />
        <div className="tile-hand">
          {view.myHand.map((tile, index) => (
            <button
              className="tile-button"
              disabled={!canDiscard}
              key={`${tile}-${index}`}
              type="button"
              onClick={() => {
                if (canDiscard) {
                  onAction({ type: "discard", tile });
                }
              }}
              aria-label={`${t(locale, "match.discard")} ${tile}`}
            >
              <Tile code={tile} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function OpponentRail({
  locale,
  player,
  position,
}: {
  locale: LocaleCode;
  player: MatchView["players"][number];
  position: string;
}) {
  return (
    <div className={`opponent-rail ${position}`}>
      <div className="player-strip">
        <div className="avatar small">{player.avatar}</div>
        <strong>{player.name}</strong>
        <span>
          {player.handCount} {t(locale, "match.tiles")}
        </span>
      </div>
      <div className="tile-backs" aria-label={`${player.name} concealed tiles`}>
        {Array.from({ length: Math.min(player.handCount, 13) }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <MeldList melds={player.melds} />
    </div>
  );
}

function MeldList({ melds }: { melds: string[] }) {
  if (melds.length === 0) {
    return null;
  }

  return (
    <div className="meld-list" aria-label="Declared melds">
      {melds.map((meld, index) => (
        <span key={`${meld}-${index}`}>{displayMeld(meld)}</span>
      ))}
    </div>
  );
}

function Tile({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <span className={`tile has-art ${compact ? "compact" : ""}`.trim()}>
      <img className="tile-art" src={tileAssetPath(code)} alt="" aria-hidden="true" draggable={false} />
      <span className="tile-label">{displayTile(code)}</span>
    </span>
  );
}

function tileAssetPath(code: string): string {
  return `/assets/tiles/old-hk/${code.toLowerCase()}.svg`;
}

function displayTile(code: string): string {
  return code.toUpperCase();
}

function displayMeld(meld: string): string {
  return meld
    .split(" ")
    .map((part, index) => (index === 0 ? part.toUpperCase() : displayTile(part)))
    .join(" ");
}
