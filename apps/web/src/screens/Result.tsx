import { formatT, t } from "@mahjong/i18n";
import type { LocaleCode, MatchResult } from "@mahjong/shared-types";
import { Button, Panel } from "@mahjong/ui";

export function Result({
  result,
  locale,
  onHome,
  onRematch,
}: {
  result: MatchResult;
  locale: LocaleCode;
  onHome: () => void;
  onRematch: () => void;
}) {
  const isDraw = result.fanLines.some((line) => line.id === "wall-draw");

  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{isDraw ? result.winnerName : formatT(locale, "result.wins", { name: result.winnerName })}</h1>
          <p>{isDraw ? result.policyCopy : `${result.totalFan} fan - ${result.policyCopy}`}</p>
        </div>
        <div className="heading-actions">
          <Button tone="ghost" onClick={onHome}>
            {t(locale, "nav.lobby")}
          </Button>
          <Button onClick={onRematch}>{t(locale, "result.rematch")}</Button>
        </div>
      </div>

      <div className="result-grid">
        <Panel className="fan-panel">
          <h2>{t(locale, "result.fanBreakdown")}</h2>
          {result.fanLines.map((line) => (
            <div className="fan-row" key={line.id}>
              <span>{t(locale, line.nameKey)}</span>
              <strong>{line.fan}</strong>
            </div>
          ))}
        </Panel>
        <Panel className="fan-panel">
          <h2>{t(locale, "result.coinChanges")}</h2>
          {result.deltas.map((delta, index) => (
            <div className="fan-row" key={index}>
              <span>{formatT(locale, "result.seat", { number: index + 1 })}</span>
              <strong className={delta >= 0 ? "positive" : "negative"}>
                {delta >= 0 ? "+" : ""}
                {delta.toLocaleString()}
              </strong>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
