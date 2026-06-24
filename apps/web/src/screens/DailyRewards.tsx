import { Button, Panel } from "@mahjong/ui";
import { formatT, t } from "@mahjong/i18n";
import type { DailyMission, DailyReward, DailyStreakDay, LocaleCode } from "@mahjong/shared-types";
import { Coins, Gift, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { TurnstileWidget } from "../turnstile/TurnstileWidget";

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

function DailyCardHeader({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="daily-card-header">
      <Icon aria-hidden="true" size={18} />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function DailyRewards({
  bonusClaims,
  dailyClaimed,
  locale,
  missions,
  rewards,
  spinUsed,
  streakDays,
  onClaim,
  onMissionClaim,
  onSpin,
  onRewardAd,
}: {
  bonusClaims: number;
  dailyClaimed: boolean;
  locale: LocaleCode;
  missions: DailyMission[];
  rewards: DailyReward[];
  spinUsed: boolean;
  streakDays: DailyStreakDay[];
  onClaim: (rewardId: string, turnstileToken: string) => void;
  onMissionClaim: (missionId: string, turnstileToken: string) => void;
  onSpin: (turnstileToken: string) => void;
  onRewardAd: () => void;
}) {
  const dailyReward = rewards.find((reward) => reward.id === "daily-login") ?? rewards[0];
  const bonusCap = 3;
  const bonusUsed = bonusClaims >= bonusCap;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const economyMutationBlocked = Boolean(turnstileSiteKey && !turnstileToken);

  function consumeTurnstileToken(): string | null {
    if (economyMutationBlocked) return null;
    const token = turnstileToken ?? "";
    setTurnstileToken(null);
    setTurnstileResetKey((key) => key + 1);
    return token;
  }

  function claimReward(rewardId: string) {
    const token = consumeTurnstileToken();
    if (token !== null) onClaim(rewardId, token);
  }

  function claimMission(missionId: string) {
    const token = consumeTurnstileToken();
    if (token !== null) onMissionClaim(missionId, token);
  }

  function spin() {
    const token = consumeTurnstileToken();
    if (token !== null) onSpin(token);
  }

  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "daily.title")}</h1>
          <p>{t(locale, "daily.subtitle")}</p>
        </div>
      </div>

      {turnstileSiteKey ? (
        <div className="turnstile-gate turnstile-gate-economy">
          <TurnstileWidget
            action="economy_claim"
            ariaLabel="Verify reward claim"
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
            siteKey={turnstileSiteKey}
          />
        </div>
      ) : null}

      <div className="daily-actions">
        <Panel className="daily-card">
          <DailyCardHeader icon={Gift} title={dailyReward.title} detail={dailyReward.detail} />
          <p>
            {dailyReward.rewardCoins.toLocaleString()} Coins
            {dailyReward.rewardGems > 0 ? ` + ${dailyReward.rewardGems} Gems` : ""}
          </p>
          <Button disabled={dailyClaimed || economyMutationBlocked} onClick={() => claimReward(dailyReward.id)}>
            {dailyClaimed ? t(locale, "common.claimed") : t(locale, "common.claim")}
          </Button>
        </Panel>
        <Panel className="daily-card">
          <DailyCardHeader icon={Sparkles} title="Lucky Draw" detail={t(locale, "daily.odds")} />
          <p>{t(locale, "daily.spinDetail")}</p>
          <div className="odds-list" aria-label={t(locale, "daily.odds")}>
            <span>Coins 72%</span>
            <span>Gems 18%</span>
            <span>Cosmetic fragment 10%</span>
          </div>
          <Button disabled={spinUsed || economyMutationBlocked} tone="secondary" onClick={spin}>
            {spinUsed ? t(locale, "common.claimed") : t(locale, "daily.spin")}
          </Button>
        </Panel>
        <Panel className="daily-card">
          <DailyCardHeader
            icon={Coins}
            title={t(locale, "daily.bonusTitle")}
            detail={formatT(locale, "daily.bonusUsed", { used: bonusClaims, cap: bonusCap })}
          />
          <p>{t(locale, "daily.adDetail")}</p>
          <Button disabled={bonusUsed} tone="ghost" onClick={onRewardAd}>
            {t(locale, "daily.watchAd")}
          </Button>
        </Panel>
      </div>

      <Panel className="daily-card daily-streak-panel">
        <div>
          <h2>{t(locale, "daily.streakTitle")}</h2>
          <p>{t(locale, "daily.streakDetail")}</p>
        </div>
        <div className="streak-calendar" aria-label={t(locale, "daily.streakTitle")}>
          {streakDays.map((day) => (
            <div className={`streak-day ${day.status}`} key={day.day}>
              <strong>{formatT(locale, "daily.day", { day: day.day })}</strong>
              <span>
                {day.rewardCoins.toLocaleString()} Coins
                {day.rewardGems > 0 ? ` + ${day.rewardGems} Gems` : ""}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="daily-card daily-missions-panel">
        <div>
          <h2>{t(locale, "daily.missionsTitle")}</h2>
          <p>{t(locale, "daily.missionsDetail")}</p>
        </div>
        <div className="mission-list">
          {missions.map((mission) => {
            const complete = mission.progress >= mission.target;
            const progressPercent = Math.min(100, Math.round((mission.progress / mission.target) * 100));
            return (
              <div className="mission-row" key={mission.id}>
                <div>
                  <strong>{mission.title}</strong>
                  <span>{mission.detail}</span>
                </div>
                <div className="mission-progress">
                  <span>
                    {mission.progress}/{mission.target}
                  </span>
                  <progress value={mission.progress} max={mission.target} />
                  <small>{mission.rewardCoins.toLocaleString()} Coins</small>
                </div>
                <Button disabled={!complete || mission.claimed || economyMutationBlocked} tone={complete ? "secondary" : "ghost"} onClick={() => claimMission(mission.id)}>
                  {mission.claimed ? t(locale, "common.claimed") : complete ? t(locale, "common.claim") : `${progressPercent}%`}
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
