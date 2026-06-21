import { Button, Panel } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import { bankrollReserveFor } from "@mahjong/shared-types";
import type { GameMode, LocaleCode, TableConfig, TablePrivacy, TableType } from "@mahjong/shared-types";

export function CreateTable({
  locale,
  config,
  onBack,
  onChange,
  onCreate,
}: {
  locale: LocaleCode;
  config: TableConfig;
  onBack: () => void;
  onChange: (config: TableConfig) => void;
  onCreate: (config: TableConfig) => void;
}) {
  function update(next: Partial<TableConfig>) {
    const merged = { ...config, ...next };
    onChange({
      ...merged,
      buyIn: merged.tableType === "coin" ? 2_000 : 0,
    });
  }

  return (
    <div className="screen create-screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "create.title")}</h1>
          <p>{t(locale, "create.subtitle")}</p>
        </div>
        <Button tone="ghost" onClick={onBack}>
          {t(locale, "common.back")}
        </Button>
      </div>

      <Panel className="form-panel">
        <Segmented
          label={t(locale, "create.rules")}
          value={config.mode}
          options={[
            ["3-fan", "Old Hong Kong 3 Fan"],
            ["1-fan", "Old Hong Kong 1 Fan"],
          ]}
          onChange={(mode) => update({ mode: mode as GameMode })}
        />
        <Segmented
          label={t(locale, "create.table")}
          value={config.tableType}
          options={[
            ["friendly", "Friendly"],
            ["coin", "Coin Table"],
          ]}
          onChange={(tableType) => update({ tableType: tableType as TableType })}
        />
        <Segmented
          label={t(locale, "create.privacy")}
          value={config.privacy}
          options={[
            ["private", "Private"],
            ["public", "Public"],
          ]}
          onChange={(privacy) => update({ privacy: privacy as TablePrivacy })}
        />
        <label className="field-row">
          {t(locale, "create.timer")}
          <input
            min={12}
            max={40}
            type="range"
            value={config.timerSeconds}
            onChange={(event) => update({ timerSeconds: Number(event.target.value) })}
          />
          <strong>{config.timerSeconds}s</strong>
        </label>
        <label className="field-row">
          {t(locale, "create.maxPlayers")}
          <select
            value={config.maxPlayers}
            onChange={(event) => update({ maxPlayers: Number(event.target.value) as 2 | 3 | 4 })}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <div className="form-summary">
          <span>{t(locale, "create.entry")}</span>
          <strong>
            {config.buyIn > 0
              ? `${config.buyIn.toLocaleString()} base - ${bankrollReserveFor(config).toLocaleString()} reserve`
              : t(locale, "create.noCoins")}
          </strong>
        </div>
        <Button onClick={() => onCreate(config)}>{t(locale, "create.friendRoom")}</Button>
      </Panel>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-field">
      <span>{label}</span>
      <div className="segmented-control">
        {options.map(([id, text]) => (
          <button
            key={id}
            className={value === id ? "selected" : ""}
            type="button"
            onClick={() => onChange(id)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
