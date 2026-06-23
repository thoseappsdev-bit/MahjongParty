import { Button } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import { CircleHelp, Home, MessageCircle, StepForward } from "lucide-react";
import { useEffect, useState } from "react";
import type { LegalAction, LocaleCode, MatchIntent, MatchView } from "@mahjong/shared-types";
import { MatchBoard } from "./MatchBoard";

const actionKeys: Record<LegalAction, string> = {
  chi: "match.chi",
  pong: "match.pong",
  kong: "match.kong",
  win: "match.win",
  discard: "match.discard",
};

const actionInfoKeys: Record<LegalAction, string> = {
  chi: "actionInfo.chi",
  pong: "actionInfo.pong",
  kong: "actionInfo.kong",
  win: "actionInfo.win",
  discard: "actionInfo.discard",
};

const allActions = Object.keys(actionKeys) as LegalAction[];

export function InMatch({
  eventLog = [],
  hideTimer = false,
  isPractice = false,
  locale,
  tutorialOpen = false,
  view,
  onAction,
  onExit,
  onRestartTutorial,
  onTutorialClose,
}: {
  eventLog?: string[];
  hideTimer?: boolean;
  isPractice?: boolean;
  locale: LocaleCode;
  tutorialOpen?: boolean;
  view: MatchView;
  onAction: (intent: MatchIntent) => void;
  onExit: () => void;
  onRestartTutorial?: () => void;
  onTutorialClose?: () => void;
}) {
  const [tutorialStep, setTutorialStep] = useState(0);
  const [displaySeconds, setDisplaySeconds] = useState(view.timerSeconds);
  const tutorialKeys = ["tutorial.step1", "tutorial.step2", "tutorial.step3", "tutorial.step4", "tutorial.step5"];
  const isLastTutorialStep = tutorialStep === tutorialKeys.length - 1;
  const tutorialGuideKey = tutorialGuideKeyFor(view.legalActions[0]);
  const canDiscard = view.legalActions.includes("discard");
  const canPass = Boolean(!isPractice && view.claimPrompt && view.legalActions.length > 0);
  const visibleEvents = eventLog.slice(-9);
  const latestEvent = eventLog.at(-1) ?? view.recentEvent;
  const tutorialScenarioBanner = isPractice && latestEvent.includes("Scenario 2") ? latestEvent : null;
  const turnStatus = statusForView(view, canPass);

  useEffect(() => {
    if (hideTimer) {
      return;
    }
    setDisplaySeconds(view.timerSeconds);
  }, [hideTimer, view.timerSeconds, view.turnSeat, view.wallCount, view.recentEvent]);

  useEffect(() => {
    if (hideTimer) {
      return;
    }

    const timer = window.setInterval(() => {
      setDisplaySeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hideTimer]);

  useEffect(() => {
    if (hideTimer || displaySeconds !== 0) {
      return;
    }

    if (canPass) {
      onAction({ type: "pass" });
      return;
    }

    if (canDiscard && view.myHand.length > 0) {
      onAction({ type: "discard", tile: view.myHand[0] });
    }
  }, [canDiscard, canPass, displaySeconds, hideTimer, onAction, view.myHand]);

  function closeTutorial() {
    setTutorialStep(0);
    onTutorialClose?.();
  }

  function submitAction(intent: MatchIntent) {
    if (intent.type === "pass") {
      if (canPass) {
        onAction(intent);
      }
      return;
    }

    if (intent.type !== "emote" && !view.legalActions.includes(intent.type)) {
      return;
    }

    onAction(intent);
  }

  return (
    <div className="screen match-screen">
      <div className="match-header">
        <div>
          <h1>{t(locale, matchModeTitleKey(view.mode))}</h1>
          <p>
            {t(locale, "match.hand")} {view.handNumber} - {t(locale, "match.wall")} {view.wallCount} -{" "}
            {view.recentEvent}
          </p>
          <div className="turn-banner">{turnStatus}</div>
        </div>
        <div className="match-tools">
          {hideTimer ? null : (
            <span className="timer" aria-label="Turn timer">
              {displaySeconds}s
            </span>
          )}
          {isPractice ? (
            <Button tone="secondary" onClick={onRestartTutorial}>
              {t(locale, "tutorial.restart")}
            </Button>
          ) : null}
          <Button tone="ghost" onClick={onExit}>
            <Home size={18} />
          </Button>
        </div>
      </div>

      {isPractice && tutorialOpen ? (
        <div className="tutorial-card" role="dialog" aria-label={t(locale, "tutorial.title")}>
          <div>
            <strong>{t(locale, "tutorial.title")}</strong>
            <span>
              {tutorialStep + 1}/{tutorialKeys.length}
            </span>
          </div>
          <p>{t(locale, tutorialKeys[tutorialStep])}</p>
          {tutorialGuideKey ? <p className="tutorial-why">{t(locale, tutorialGuideKey)}</p> : null}
          {tutorialScenarioBanner ? <p className="tutorial-why">{tutorialScenarioBanner}</p> : null}
          <div className="tutorial-actions">
            <Button tone="ghost" onClick={closeTutorial}>
              {t(locale, "tutorial.skip")}
            </Button>
            <Button
              onClick={() => {
                if (isLastTutorialStep) {
                  closeTutorial();
                  return;
                }
                setTutorialStep((step) => step + 1);
              }}
            >
              {t(locale, isLastTutorialStep ? "tutorial.done" : "tutorial.next")}
            </Button>
          </div>
        </div>
      ) : null}

      <MatchBoard
        canDiscard={canDiscard}
        locale={locale}
        tutorialScenarioBanner={tutorialScenarioBanner}
        view={view}
        onAction={onAction}
      />

      {visibleEvents.length > 0 ? (
        <div className="event-feed" aria-label={t(locale, "match.eventFeed")}>
          {visibleEvents.map((event, index) => (
            <span key={`${event}-${index}`}>{event}</span>
          ))}
        </div>
      ) : null}

      <div className="action-bar">
        {allActions.map((action) => (
          <div className="action-control" key={action}>
            <Button
              tone={action === "win" ? "primary" : "secondary"}
              disabled={!view.legalActions.includes(action)}
              onClick={() => submitAction({ type: action })}
            >
              {t(locale, actionKeys[action])}
            </Button>
            <span className="action-info" tabIndex={0} aria-label={t(locale, actionInfoKeys[action])}>
              <CircleHelp aria-hidden="true" size={14} />
              <span className="action-tooltip" role="tooltip">
                {t(locale, actionInfoKeys[action])}
              </span>
            </span>
          </div>
        ))}
        {canPass ? (
          <Button tone="ghost" onClick={() => submitAction({ type: "pass" })}>
            <StepForward size={18} />
            Pass
          </Button>
        ) : null}
        <Button tone="ghost" onClick={() => submitAction({ type: "emote" })}>
          <MessageCircle size={18} />
          {t(locale, "match.emote")}
        </Button>
      </div>
    </div>
  );
}

function tutorialGuideKeyFor(action: LegalAction | undefined): string | null {
  if (!action) {
    return null;
  }

  return {
    chi: "tutorial.whyChi",
    pong: "tutorial.whyPong",
    kong: "tutorial.whyKong",
    win: "tutorial.whyWin",
    discard: "tutorial.whyDiscard",
  }[action];
}

function matchModeTitleKey(mode: MatchView["mode"]): string {
  if (mode === "riichi") {
    return "match.modeRiichi";
  }
  return mode === "3-fan" ? "match.mode3" : "match.mode1";
}
function statusForView(view: MatchView, canPass: boolean): string {
  if (canPass) {
    return "Claim available: choose a highlighted action, or Pass before the timer reaches zero.";
  }

  if (view.legalActions.includes("discard")) {
    return "Your turn: choose a tile to discard.";
  }

  if (view.legalActions.length > 0) {
    return "Action available: choose a highlighted button.";
  }

  const activePlayer = view.players[view.turnSeat];
  return `${activePlayer.name} is thinking.`;
}
