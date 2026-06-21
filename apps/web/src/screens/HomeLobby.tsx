import { Button, CurrencyPill, Panel, RewardChip } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import { Bot, Gift, Play, Settings, ShoppingBag, Trophy } from "lucide-react";
import type { LocaleCode, Profile, Route, Wallet } from "@mahjong/shared-types";

export function HomeLobby({
  locale,
  profile,
  wallet,
  onNavigate,
  onPractice,
  onTutorial,
}: {
  locale: LocaleCode;
  profile: Profile;
  wallet: Wallet;
  onNavigate: (route: Route) => void;
  onPractice: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="screen lobby-screen">
      <section className="lobby-hero">
        <div className="profile-lockup">
          <div className="avatar">{profile.avatar}</div>
          <div>
            <h1>Mahjong Party</h1>
            <p>
              {profile.displayName} - Level {profile.level} - {t(locale, "home.subtitle")}
            </p>
          </div>
        </div>
        <div className="hero-wallet">
          <CurrencyPill kind="coins" label={t(locale, "currency.coins")} value={wallet.coins} />
          <CurrencyPill kind="gems" label={t(locale, "currency.gems")} value={wallet.gems} />
        </div>
      </section>

      <div className="quick-actions">
        <Button onClick={() => onNavigate("play")}>
          <Play size={18} />
          {t(locale, "home.playTables")}
        </Button>
        <Button tone="secondary" onClick={() => onNavigate("daily")}>
          <Gift size={18} />
          {t(locale, "home.daily")}
        </Button>
        <Button tone="secondary" onClick={() => onNavigate("shop")}>
          <ShoppingBag size={18} />
          {t(locale, "home.shop")}
        </Button>
        <Button tone="ghost" onClick={() => onNavigate("settings")}>
          <Settings size={18} />
          {t(locale, "home.settings")}
        </Button>
      </div>

      <div className="content-grid">
        <Panel className="feature-panel">
          <Trophy size={22} />
          <h2>{t(locale, "home.rankedTitle")}</h2>
          <p>{t(locale, "home.rankedBody")}</p>
          <Button disabled tone="ghost">
            {t(locale, "home.comingSoon")}
          </Button>
        </Panel>
        <Panel className="feature-panel">
          <Bot size={22} />
          <h2>{t(locale, "home.practiceTitle")}</h2>
          <p>{t(locale, "home.practiceBody")}</p>
          <div className="feature-actions">
            <Button tone="secondary" onClick={onPractice}>
              {t(locale, "home.startPractice")}
            </Button>
            <Button tone="ghost" onClick={onTutorial}>
              {t(locale, "home.startTutorial")}
            </Button>
          </div>
        </Panel>
        <Panel className="rewards-panel">
          <RewardChip title={t(locale, "home.dailyLogin")} detail={t(locale, "home.dailyLoginDetail")} />
          <RewardChip title={t(locale, "home.friendRoom")} detail={t(locale, "home.friendRoomDetail")} />
        </Panel>
      </div>
    </div>
  );
}
