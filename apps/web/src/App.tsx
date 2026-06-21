import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Button, CurrencyPill, Toast } from "@mahjong/ui";
import { t } from "@mahjong/i18n";
import {
  advancePracticeBotTurn,
  createMatchState,
  createPracticeMatch,
  createTutorialMatch,
  resolveMatchAction,
  resolveNextBotTurn,
  practiceToMatchView,
  resolvePracticeAction,
  type MatchState,
  type PracticeMatchState,
} from "@mahjong/game-core";
import type {
  DailyMission,
  DailyReward,
  LocaleCode,
  MatchIntent,
  MatchResult,
  MatchView,
  Route,
  RoomLobbyState,
  TableConfig,
  Wallet,
} from "@mahjong/shared-types";
import { bankrollReserveFor } from "@mahjong/shared-types";
import {
  catalog,
  dailyMissions,
  dailyRewards,
  dailyStreakDays,
  defaultTableConfig,
  initialMatchView,
  mockAuditReplayEvents,
  lobby as baseLobby,
  profile,
  publicTables,
  result,
  wallet as initialWallet,
} from "./mock/mockData";
import { createPracticeRoom, createRoom } from "./mock/mockGameRoom";
import { joinTableWithWallet } from "./mock/mockEconomy";
import { matchStateToResult, matchStateToView } from "./mock/matchEngineAdapter";
import { resultFromPractice } from "./mock/practiceResult";
import { loadStoredLocale, saveStoredLocale } from "./localeStorage";
import { loadStoredWallet, saveStoredWallet } from "./walletStorage";
import { loadOrCreatePlayerId } from "./playerIdentityStorage";
import {
  buyCatalogItem as buyCatalogItemFromBackend,
  buyIn as buyInFromBackend,
  claimDailyReward as claimDailyRewardFromBackend,
  claimMission as claimMissionFromBackend,
  getCatalog as getBackendCatalog,
  getWallet as getBackendWallet,
  getDailyMissions as getDailyMissionsFromBackend,
  rewardAd as rewardAdFromBackend,
  recordMissionProgress as recordMissionProgressFromBackend,
  spinWheel as spinWheelFromBackend,
} from "./economy/economyClient";
import {
  createLanRoom,
  defaultLanApiBase,
  getLanHealth,
  getLanRoom,
  joinDiscordActivityRoom,
  joinLanRoom,
  leaveLanRoom,
  rematchLanRoom,
  startLanMatch,
  submitLanAction,
  type LanSession,
} from "./lan/lanClient";
import { connectRoomSocket, type RoomSocket } from "./lan/roomSocket";
import {
  initSupabaseAuth,
  restartSupabaseGuest,
  sendSupabaseMagicLink,
  signOutSupabaseSession,
  type AuthProfile,
} from "./auth/initSupabaseAuth";
import { clearStoredLanSession, loadStoredLanSession, saveStoredLanSession } from "./lan/lanSessionStorage";
import {
  authenticateDiscordActivity,
  connectDiscordActivity,
  discordActivityUnavailable,
  type DiscordActivityState,
} from "./discord/discordActivity";


type AuthStatus = "checking" | "guest" | "signed-in" | "offline" | "error";

function profileToAuthStatus(authProfile: AuthProfile | null): AuthStatus {
  return authProfile ? authProfile.status : "offline";
}

const HomeLobby = lazy(() => import("./screens/HomeLobby").then((module) => ({ default: module.HomeLobby })));
const PlayTablesHub = lazy(() => import("./screens/PlayTablesHub").then((module) => ({ default: module.PlayTablesHub })));
const CreateTable = lazy(() => import("./screens/CreateTable").then((module) => ({ default: module.CreateTable })));
const WaitingRoom = lazy(() => import("./screens/WaitingRoom").then((module) => ({ default: module.WaitingRoom })));
const InMatch = lazy(() => import("./screens/InMatch").then((module) => ({ default: module.InMatch })));
const Result = lazy(() => import("./screens/Result").then((module) => ({ default: module.Result })));
const Shop = lazy(() => import("./screens/Shop").then((module) => ({ default: module.Shop })));
const DailyRewards = lazy(() => import("./screens/DailyRewards").then((module) => ({ default: module.DailyRewards })));
const Settings = lazy(() => import("./screens/Settings").then((module) => ({ default: module.Settings })));
const AuditReplayViewer = lazy(() => import("./screens/AuditReplayViewer").then((module) => ({ default: module.AuditReplayViewer })));
const navItems: Array<{ route: Route; labelKey: string }> = [
  { route: "home", labelKey: "nav.lobby" },
  { route: "play", labelKey: "nav.tables" },
  { route: "shop", labelKey: "nav.shop" },
  { route: "daily", labelKey: "nav.daily" },
  { route: "settings", labelKey: "nav.settings" },
];

export function App() {
  const [route, setRoute] = useState<Route>("home");
  const [wallet, setWallet] = useState<Wallet>(() =>
    typeof window === "undefined" ? initialWallet : loadStoredWallet(window.localStorage) ?? initialWallet,
  );
  const [localPlayerId] = useState(() =>
    typeof window === "undefined" ? profile.userId : loadOrCreatePlayerId(window.localStorage),
  );
  // Once Supabase auth resolves, the authenticated profile is the real identity
  // (the server derives it from the verified JWT). Until then we use the local id.
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const playerId = authProfile?.userId ?? localPlayerId;
  const [locale, setLocale] = useState<LocaleCode>(() =>
    typeof window === "undefined" ? "en" : loadStoredLocale(window.localStorage) ?? "en",
  );
  const [tableConfig, setTableConfig] = useState<TableConfig>(defaultTableConfig);
  const [room, setRoom] = useState<RoomLobbyState>(baseLobby);
  const [matchView, setMatchView] = useState<MatchView>(initialMatchView);
  const [matchEngineState, setMatchEngineState] = useState<MatchState | null>(null);
  const [currentResult, setCurrentResult] = useState<MatchResult>(result);
  const [practiceState, setPracticeState] = useState<PracticeMatchState | null>(null);
  const [isPractice, setIsPractice] = useState(false);
  const [practiceMode, setPracticeMode] = useState<"ai" | "tutorial" | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [rewards, setRewards] = useState<DailyReward[]>(dailyRewards);
  const [missions, setMissions] = useState<DailyMission[]>(dailyMissions);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [dailyBonusClaims, setDailyBonusClaims] = useState(0);
  const [dailySpinUsed, setDailySpinUsed] = useState(false);
  const [shopCatalog, setShopCatalog] = useState(catalog);
  const [toast, setToast] = useState<string | null>(null);
  const [lanApiBase] = useState(() => defaultLanApiBase());
  const [lanSession, setLanSession] = useState<LanSession | null>(null);
  const [lanEventLog, setLanEventLog] = useState<string[] | null>(null);
  const [lanAuditMessages, setLanAuditMessages] = useState<string[] | null>(null);
  const [lanWebUrl, setLanWebUrl] = useState<string | null>(null);
  const [discordActivity, setDiscordActivity] = useState<DiscordActivityState>(discordActivityUnavailable);
  const practiceStateRef = useRef<PracticeMatchState | null>(null);
  const matchEngineStateRef = useRef<MatchState | null>(null);

  const activeProfile = useMemo(
    () =>
      discordActivity.user
        ? {
            ...profile,
            userId: playerId,
            displayName: discordActivity.user.displayName,
            avatar: discordActivity.user.avatar,
            locale,
          }
        : { ...profile, userId: playerId, locale },
    [discordActivity.user, locale, playerId],
  );

  function applyAuthProfile(nextProfile: AuthProfile | null) {
    setAuthProfile(nextProfile);
    setAuthStatus(profileToAuthStatus(nextProfile));
    setAuthError(null);
  }

  // Boot Supabase auth (anonymous sign-in) so API calls carry a verified bearer
  // token. The server enforces JWT identity in production; this makes the client
  // actually authenticate. Falls back to the local id when env is unconfigured.
  useEffect(() => {
    let cancelled = false;
    initSupabaseAuth((nextProfile) => {
      if (!cancelled) {
        applyAuthProfile(nextProfile);
      }
    })
      .then(({ profile: nextProfile, error }) => {
        if (!cancelled) {
          if (nextProfile) {
            applyAuthProfile(nextProfile);
          } else {
            setAuthProfile(null);
            setAuthStatus(error ? "error" : "offline");
            setAuthError(error ?? null);
          }
        }
        if (error) {
          console.warn(`[auth] ${error}`);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAuthStatus("error");
          setAuthError(error instanceof Error ? error.message : "Auth init failed");
        }
        console.warn("[auth] init failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function commitPracticeState(nextPractice: PracticeMatchState) {
    practiceStateRef.current = nextPractice;
    setPracticeState(nextPractice);
    setMatchView(practiceToMatchView(nextPractice));
  }

  function commitMatchState(nextMatch: MatchState, config: TableConfig) {
    matchEngineStateRef.current = nextMatch;
    setMatchEngineState(nextMatch);
    setMatchView(matchStateToView(nextMatch, config));
  }

  function clearPracticeState() {
    practiceStateRef.current = null;
    setPracticeState(null);
  }

  function clearMatchState() {
    matchEngineStateRef.current = null;
    setMatchEngineState(null);
  }

  function rememberLanSession(session: LanSession | null) {
    setLanSession(session);
    if (typeof window === "undefined") {
      return;
    }
    if (session) {
      saveStoredLanSession(window.localStorage, session);
      return;
    }
    clearStoredLanSession(window.localStorage);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    saveStoredWallet(window.localStorage, wallet);
  }, [wallet]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    saveStoredLocale(window.localStorage, locale);
  }, [locale]);

  useEffect(() => {
    if (
      !isPractice ||
      !practiceState ||
      practiceState.kind !== "ai" ||
      practiceState.phase !== "playing" ||
      practiceState.claimOffer ||
      practiceState.pendingBotSeats.length === 0
    ) {
      return;
    }

    const botTimer = window.setTimeout(() => {
      const currentPractice = practiceStateRef.current;
      if (
        !currentPractice ||
        currentPractice.kind !== "ai" ||
        currentPractice.phase !== "playing" ||
        currentPractice.claimOffer ||
        currentPractice.pendingBotSeats.length === 0
      ) {
        return;
      }

      const nextPractice = advancePracticeBotTurn(currentPractice);
      commitPracticeState(nextPractice);
      if (nextPractice.phase === "complete") {
        const finishedResult = resultFromPractice(nextPractice);
        setCurrentResult(finishedResult);
        recordCompletedHandMissions(finishedResult);
        window.setTimeout(() => setRoute("result"), 500);
      }
    }, 950);

    return () => window.clearTimeout(botTimer);
  }, [isPractice, practiceState]);

  useEffect(() => {
    const botOnlyClaimWindow =
      !!matchEngineState?.claimWindow && matchEngineState.claimWindow.offers.every((offer) => offer.seat !== 0);
    if (
      isPractice ||
      !matchEngineState ||
      matchEngineState.phase !== "playing" ||
      (!botOnlyClaimWindow && !matchEngineState.players[matchEngineState.turnSeat].isBot)
    ) {
      return;
    }

    const botTimer = window.setTimeout(() => {
      const currentMatch = matchEngineStateRef.current;
      const currentBotOnlyClaimWindow =
        !!currentMatch?.claimWindow && currentMatch.claimWindow.offers.every((offer) => offer.seat !== 0);
      if (
        !currentMatch ||
        currentMatch.phase !== "playing" ||
        (!currentBotOnlyClaimWindow && !currentMatch.players[currentMatch.turnSeat].isBot)
      ) {
        return;
      }

      const nextMatch = resolveNextBotTurn(currentMatch);
      commitMatchState(nextMatch, tableConfig);
      if (nextMatch.phase === "complete") {
        const finishedResult = matchStateToResult(nextMatch);
        setCurrentResult(finishedResult);
        recordCompletedHandMissions(finishedResult);
        window.setTimeout(() => setRoute("result"), 500);
      }
    }, 950);

    return () => window.clearTimeout(botTimer);
  }, [isPractice, matchEngineState, tableConfig]);

  useEffect(() => {
    setDiscordActivity((state) => (state.status === "unavailable" ? { ...state, status: "connecting" } : state));
    connectDiscordActivity().then(setDiscordActivity);
  }, []);

  useEffect(() => {
    getLanHealth(lanApiBase)
      .then((health) => {
        const fallbackUrl = typeof window === "undefined" ? null : window.location.origin;
        const networkUrl = health.webUrls?.find((url) => !url.includes("127.0.0.1")) ?? health.webUrls?.[0] ?? fallbackUrl;
        setLanWebUrl(networkUrl);
      })
      .catch(() => setLanWebUrl(typeof window === "undefined" ? null : window.location.origin));
  }, [lanApiBase]);

  useEffect(() => {
    getBackendWallet(lanApiBase, playerId)
      .then(setWallet)
      .catch(() => undefined);
    getBackendCatalog(lanApiBase)
      .then((items) => setShopCatalog([...items.coinPacks, ...items.cosmetics, ...items.gemPacks]))
      .catch(() => undefined);
    getDailyMissionsFromBackend(lanApiBase, playerId)
      .then(setMissions)
      .catch(() => undefined);
  }, [lanApiBase, playerId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadStoredLanSession(window.localStorage);
    if (!stored) {
      return;
    }

    getLanRoom(lanApiBase, stored)
      .then((snapshot) => {
        rememberLanSession(stored);
        syncLanSnapshot(snapshot);
        setRoute(snapshot.phase === "waiting" ? "waiting" : snapshot.phase === "complete" ? "result" : "match");
        showToast(`Reconnected to room ${stored.roomCode}.`);
      })
      .catch(() => {
        clearStoredLanSession(window.localStorage);
      });
  }, [lanApiBase]);

  useEffect(() => {
    if (!lanSession) {
      return;
    }

    let cancelled = false;
    let socketOpen = false;
    let socket: RoomSocket | null = null;

    const refresh = () =>
      getLanRoom(lanApiBase, lanSession)
        .then((snapshot) => {
          if (!cancelled) {
            syncLanSnapshot(snapshot);
          }
        })
        .catch(() => undefined);

    // Primary realtime channel: the server pushes authoritative snapshots over a
    // WebSocket. HTTP polling stays only as a fallback while the socket is down.
    try {
      socket = connectRoomSocket(lanApiBase, lanSession, {
        onOpen: () => {
          socketOpen = true;
        },
        onSnapshot: (snapshot) => {
          if (!cancelled) {
            syncLanSnapshot(snapshot);
          }
        },
        onClose: () => {
          socketOpen = false;
        },
        onError: () => {
          socketOpen = false;
        },
      });
    } catch {
      socket = null;
    }

    const poll = window.setInterval(() => {
      if (!socketOpen) {
        void refresh();
      }
    }, 1500);
    void refresh();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      socket?.close();
    };
  }, [lanApiBase, lanSession]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function handleSendMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
    const redirectTo = typeof window === "undefined" ? undefined : window.location.href;
    const result = await sendSupabaseMagicLink(email, redirectTo);
    if (result.ok) {
      showToast(t(locale, "settings.magicLinkSent"));
      return result;
    }
    showToast(result.error ?? t(locale, "settings.accountActionFailed"));
    return result;
  }

  async function handleSignOut(): Promise<{ ok: boolean; error?: string }> {
    const result = await signOutSupabaseSession();
    if (result.ok) {
      setAuthProfile(null);
      setAuthStatus("offline");
      setAuthError(null);
      showToast(t(locale, "settings.signedOut"));
      return result;
    }
    showToast(result.error ?? t(locale, "settings.accountActionFailed"));
    return result;
  }

  async function handleNewGuest(): Promise<{ ok: boolean; error?: string }> {
    setAuthStatus("checking");
    const result = await restartSupabaseGuest(applyAuthProfile);
    if (result.profile) {
      applyAuthProfile(result.profile);
      showToast(t(locale, "settings.guestStarted"));
      return { ok: true };
    }
    setAuthStatus(result.error ? "error" : "offline");
    setAuthError(result.error ?? null);
    showToast(result.error ?? t(locale, "settings.accountActionFailed"));
    return { ok: false, error: result.error };
  }

  function handleShareRoom() {
    const shareText = roomInviteUrl(room.roomCode);
    void navigator.clipboard?.writeText(shareText).catch(() => undefined);
    showToast(`Invite link copied for room ${room.roomCode}.`);
  }

  async function handleCreateRoom(config: TableConfig) {
    rememberLanSession(null);
    setLanEventLog(null);
    setLanAuditMessages(null);
    const entry = await payTableEntry(config);
    if (!entry.ok) {
      showToast(entry.message);
      return;
    }

    setWallet(entry.wallet);
    const nextRoom = createRoom(config);
    setRoom(nextRoom);
    setTableConfig(config);
    setRoute("waiting");
    showToast(entry.wallet === wallet ? `Room ${nextRoom.roomCode} created.` : entry.message);
  }

  async function handleJoinTable(config: TableConfig) {
    rememberLanSession(null);
    setLanEventLog(null);
    setLanAuditMessages(null);
    const entry = await payTableEntry(config);
    if (!entry.ok) {
      showToast(entry.message);
      return;
    }

    setWallet(entry.wallet);
    const nextRoom = createRoom(config);
    setRoom(nextRoom);
    setTableConfig(config);
    setRoute("waiting");
    showToast(entry.message);
  }

  function handleStartMatch() {
    if (lanSession) {
      startLanMatch(lanApiBase, lanSession)
        .then((snapshot) => {
          syncLanSnapshot(snapshot);
          setRoute("match");
        })
        .catch((error) => showToast(error instanceof Error ? error.message : "LAN start failed."));
      return;
    }

    setIsPractice(false);
    setPracticeMode(null);
    clearPracticeState();
    const nextMatch = createMatchState(`room-${room.roomCode}-${Date.now()}`);
    setTutorialOpen(false);
    setCurrentResult(result);
    commitMatchState(nextMatch, room.config);
    setRoute("match");
  }

  function handleRematch() {
    if (lanSession) {
      rematchLanRoom(lanApiBase, lanSession)
        .then((snapshot) => {
          syncLanSnapshot(snapshot);
          setRoute("match");
        })
        .catch((error) => showToast(error instanceof Error ? error.message : "LAN rematch failed."));
      return;
    }

    handleStartMatch();
  }

  function handleLeaveRoom() {
    if (!lanSession) {
      setRoute("home");
      return;
    }

    const leavingSession = lanSession;
    leaveLanRoom(lanApiBase, lanSession)
      .then(() => {
        rememberLanSession(null);
        setLanEventLog(null);
        setLanAuditMessages(null);
        clearMatchState();
        clearPracticeState();
        setRoute("play");
        showToast(`Left room ${leavingSession.roomCode}.`);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "LAN leave failed."));
  }

  function handleStartPractice() {
    rememberLanSession(null);
    setLanEventLog(null);
    setLanAuditMessages(null);
    const practiceRoom = createPracticeRoom();
    const nextPractice = createPracticeMatch(`practice-${Date.now()}`);
    setRoom(practiceRoom);
    clearMatchState();
    commitPracticeState(nextPractice);
    setIsPractice(true);
    setPracticeMode("ai");
    setTutorialOpen(false);
    setRoute("match");
    showToast("AI practice table started.");
  }

  function handleStartTutorial() {
    rememberLanSession(null);
    setLanEventLog(null);
    setLanAuditMessages(null);
    const practiceRoom = createPracticeRoom();
    const nextPractice = createTutorialMatch();
    setRoom(practiceRoom);
    clearMatchState();
    commitPracticeState(nextPractice);
    setIsPractice(true);
    setPracticeMode("tutorial");
    setTutorialOpen(true);
    setRoute("match");
    showToast("Tutorial table started.");
  }

  function handleMatchAction(intent: MatchIntent) {
    if (lanSession) {
      submitLanAction(lanApiBase, lanSession, intent)
        .then((snapshot) => {
          if (isMeldClaimIntent(intent)) {
            recordDailyMission({ type: "claim-melds" });
          }
          syncLanSnapshot(snapshot);
        })
        .catch((error) => showToast(error instanceof Error ? error.message : "LAN action failed."));
      return;
    }

    const currentPractice = practiceStateRef.current;
    if (isPractice && currentPractice) {
      const nextPractice = resolvePracticeAction(currentPractice, intent);
      commitPracticeState(nextPractice);
      if (currentPractice.claimOffer && !nextPractice.claimOffer && isMeldClaimIntent(intent)) {
        recordDailyMission({ type: "claim-melds" });
      }
      if (nextPractice.phase === "complete") {
        const finishedResult = resultFromPractice(nextPractice);
        setCurrentResult(finishedResult);
        recordCompletedHandMissions(finishedResult);
        window.setTimeout(() => setRoute("result"), 500);
      }
      return;
    }

    const currentMatch = matchEngineStateRef.current;
    if (currentMatch) {
      const nextMatch = resolveMatchAction(currentMatch, { seat: 0, type: intent.type, tile: intent.tile });
      commitMatchState(nextMatch, tableConfig);
      if (currentMatch.claimWindow && !nextMatch.claimWindow && isMeldClaimIntent(intent)) {
        recordDailyMission({ type: "claim-melds" });
      }
      if (nextMatch.phase === "complete") {
        const finishedResult = matchStateToResult(nextMatch);
        setCurrentResult(finishedResult);
        recordCompletedHandMissions(finishedResult);
        window.setTimeout(() => setRoute("result"), 500);
      }
      return;
    }
  }

  function syncLanSnapshot(snapshot: Awaited<ReturnType<typeof getLanRoom>>) {
    setRoom({
      roomCode: snapshot.roomCode,
      hostUserId: snapshot.hostUserId,
      config: snapshot.config,
      seats: snapshot.seats,
    });
    setTableConfig(snapshot.config);
    setLanEventLog(snapshot.eventLog);
    setLanAuditMessages(snapshot.auditLog.map((entry) => entry.message));
    setIsPractice(false);
    setPracticeMode(null);
    clearPracticeState();
    clearMatchState();

    if (snapshot.match) {
      setMatchView(snapshot.match);
      if (snapshot.phase === "playing") {
        setRoute((currentRoute) => (currentRoute === "waiting" ? "match" : currentRoute));
      }
      if (snapshot.phase === "complete" && snapshot.result) {
        setCurrentResult(snapshot.result);
        recordCompletedHandMissions(snapshot.result);
        setRoute("result");
      }
    }
  }

  function lanProfileFor(displayName: string) {
    const trimmedName = displayName.trim() || activeProfile.displayName;
    return {
      ...activeProfile,
      displayName: trimmedName,
      avatar: trimmedName.slice(0, 1).toUpperCase() || activeProfile.avatar,
    };
  }

  function handleLanHost(displayName: string) {
    createLanRoom(lanApiBase, defaultTableConfig, lanProfileFor(displayName))
      .then((response) => {
        rememberLanSession({ roomCode: response.room.roomCode, seat: response.seat, userId: response.userId });
        syncLanSnapshot(response.room);
        setRoute("waiting");
        showToast(`Friend room ${response.room.roomCode} hosted.`);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Friend room host failed."));
  }

  function handleLanJoin(roomCode: string, displayName: string) {
    joinLanRoom(lanApiBase, roomCode, lanProfileFor(displayName))
      .then((response) => {
        rememberLanSession({ roomCode: response.room.roomCode, seat: response.seat, userId: response.userId });
        syncLanSnapshot(response.room);
        setRoute(response.room.phase === "playing" ? "match" : "waiting");
        showToast(`Joined friend room ${response.room.roomCode} as seat ${response.seat + 1}.`);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Friend room join failed."));
  }

  function handleDiscordRoom(displayName: string) {
    if ((discordActivity.status !== "ready" && discordActivity.status !== "authenticated") || !discordActivity.instanceId) {
      showToast("Discord Activity is not ready yet.");
      return;
    }

    joinDiscordActivityRoom(lanApiBase, {
      instanceId: discordActivity.instanceId,
      config: defaultTableConfig,
      profile: lanProfileFor(displayName),
    })
      .then((response) => {
        rememberLanSession({ roomCode: response.room.roomCode, seat: response.seat, userId: response.userId });
        syncLanSnapshot(response.room);
        setRoute(response.room.phase === "playing" ? "match" : "waiting");
        showToast(`Discord table ${response.room.roomCode} joined.`);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Discord table join failed."));
  }

  function handleDiscordSignIn() {
    setDiscordActivity((state) => ({ ...state, status: "authenticating", error: null }));
    authenticateDiscordActivity(lanApiBase)
      .then((state) => {
        setDiscordActivity(state);
        if (state.status === "authenticated" && state.user) {
          showToast(`Signed in as ${state.user.displayName}.`);
        } else if (state.error) {
          showToast(state.error);
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Discord sign-in failed.";
        setDiscordActivity((state) => ({ ...state, status: "error", error: message }));
        showToast(message);
      });
  }

  function roomInviteUrl(roomCode: string): string {
    const baseUrl = lanWebUrl ?? (typeof window === "undefined" ? "" : window.location.origin);
    const url = new URL(baseUrl || "http://127.0.0.1:5173");
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  async function payTableEntry(config: TableConfig): Promise<{ ok: boolean; wallet: Wallet; message: string }> {
    if (config.tableType !== "coin" || config.buyIn <= 0) {
      return joinTableWithWallet(wallet, config);
    }

    try {
      const reserve = bankrollReserveFor(config);
      const response = await buyInFromBackend(lanApiBase, activeProfile.userId, reserve);
      return { ok: true, wallet: response.wallet, message: `${reserve.toLocaleString()} Coins bankroll reserved.` };
    } catch (error) {
      return {
        ok: false,
        wallet,
        message: error instanceof Error ? error.message : "Table entry payment failed.",
      };
    }
  }

  function handleBuy(itemId: string) {
    const item = shopCatalog.find((entry) => entry.id === itemId);
    if (!item) {
      showToast("Catalog item unavailable.");
      return;
    }

    buyCatalogItemFromBackend(lanApiBase, activeProfile.userId, item.id)
      .then((response) => {
        setWallet(response.wallet);
        showToast(response.granted.kind === "coins" ? "Coin pack added from Gems." : "Cosmetic added to inventory.");
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Purchase failed."));
  }

  function handleClaimReward(rewardId: string) {
    const reward = rewards.find((entry) => entry.id === rewardId);
    if (!reward) {
      showToast("Reward unavailable.");
      return;
    }

    claimDailyRewardFromBackend(lanApiBase, activeProfile.userId)
      .then((response) => {
        setWallet(response.wallet);
        setDailyClaimed(true);
        setRewards((items) => items.map((item) => (item.id === rewardId ? { ...response.reward, claimed: true } : item)));
        showToast(`Daily reward claimed. Streak ${response.streak}.`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Daily reward failed.";
        if (message.includes("already claimed")) {
          setDailyClaimed(true);
        }
        showToast(message);
      });
  }

  function handleClaimMission(missionId: string) {
    claimMissionFromBackend(lanApiBase, activeProfile.userId, missionId)
      .then((response) => {
        setWallet(response.wallet);
        setMissions((items) => items.map((item) => (item.id === missionId ? response.mission : item)));
        showToast(`${response.mission.title} claimed.`);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Mission claim failed."));
  }

  function recordDailyMission(event: { type: "play" } | { type: "win-with-pong" } | { type: "claim-melds"; count?: number }) {
    recordMissionProgressFromBackend(lanApiBase, activeProfile.userId, event)
      .then((response) => setMissions(response.missions))
      .catch(() => undefined);
  }

  function recordCompletedHandMissions(resultToRecord: MatchResult) {
    recordDailyMission({ type: "play" });
    if (resultToRecord.winnerSeat === 0 && resultToRecord.fanLines.some((line) => line.id.includes("pung") || line.id.includes("pong"))) {
      recordDailyMission({ type: "win-with-pong" });
    }
  }
  function handleSpinWheel() {
    if (dailySpinUsed) {
      showToast("Lucky Draw already used today.");
      return;
    }

    spinWheelFromBackend(lanApiBase, activeProfile.userId)
      .then((response) => {
        setWallet(response.wallet);
        setDailySpinUsed(true);
        showToast(`Lucky Draw: ${rewardText(response.reward)}.`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Lucky Draw failed.";
        if (message.includes("cap reached") || message.includes("already used")) {
          setDailySpinUsed(true);
        }
        showToast(message);
      });
  }

  function handleRewardAd() {
    rewardAdFromBackend(lanApiBase, activeProfile.userId)
      .then((response) => {
        setWallet(response.wallet);
        setDailyBonusClaims((count) => Math.min(3, count + 1));
        showToast(`Reward: ${rewardText(response.reward)}.`);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Reward failed.";
        if (message.includes("cap reached")) {
          setDailyBonusClaims(3);
        }
        showToast(message);
      });
  }

  function isMeldClaimIntent(intent: MatchIntent) {
    return intent.type === "chi" || intent.type === "pong" || intent.type === "kong";
  }

  function rewardText(reward: { type: string; amount: number; itemId?: string }) {
    if (reward.itemId) {
      return reward.itemId;
    }
    return `${reward.amount.toLocaleString()} ${reward.type}`;
  }

  const screen = {
    home: (
      <>
        <HomeLobby
          locale={locale}
          profile={activeProfile}
          wallet={wallet}
          onNavigate={setRoute}
          onPractice={handleStartPractice}
          onTutorial={handleStartTutorial}
        />
        <AuditReplayViewer
          events={mockAuditReplayEvents}
          playerNames={matchView.players.map((player) => player.name)}
        />
      </>
    ),
    play: (
      <PlayTablesHub
        discordActivity={discordActivity}
        lanWebUrl={lanWebUrl}
        locale={locale}
        profile={activeProfile}
        tables={publicTables}
        onCreate={() => setRoute("create")}
        onDiscordRoom={handleDiscordRoom}
        onDiscordSignIn={handleDiscordSignIn}
        onFriendHost={handleLanHost}
        onFriendJoin={handleLanJoin}
        onJoin={handleJoinTable}
      />
    ),
    create: (
      <CreateTable
        locale={locale}
        config={tableConfig}
        onBack={() => setRoute("play")}
        onChange={setTableConfig}
        onCreate={handleCreateRoom}
      />
    ),
    waiting: (
      <WaitingRoom
        locale={locale}
        activityLog={lanAuditMessages ?? undefined}
        room={room}
        onBack={() => (lanSession ? setRoute("play") : setRoute("create"))}
        onLeave={lanSession ? handleLeaveRoom : undefined}
        onCopy={handleShareRoom}
        onStart={handleStartMatch}
        canStart={!lanSession || lanSession.userId === room.hostUserId}
        shareHint={lanSession ? `Invite link: ${roomInviteUrl(room.roomCode)} | Code: ${room.roomCode}` : null}
        statusText={
          lanSession
            ? lanSession.seat === 0
              ? "You are hosting this friend room."
              : "Waiting for the host to start the hand."
            : undefined
        }
      />
    ),
    match: (
      <InMatch
        isPractice={isPractice}
        eventLog={lanEventLog ?? practiceState?.eventLog ?? matchEngineState?.eventLog}
        hideTimer={practiceMode === "tutorial"}
        locale={locale}
        tutorialOpen={tutorialOpen}
        view={matchView}
        onAction={handleMatchAction}
        onExit={lanSession ? handleLeaveRoom : () => setRoute("home")}
        onRestartTutorial={() => setTutorialOpen(true)}
        onTutorialClose={() => setTutorialOpen(false)}
      />
    ),
    result: (
      <Result
        result={currentResult}
        locale={locale}
        onHome={() => setRoute("home")}
        onRematch={practiceMode === "tutorial" ? handleStartTutorial : isPractice ? handleStartPractice : handleRematch}
      />
    ),
    shop: <Shop locale={locale} catalog={shopCatalog} wallet={wallet} onBuy={handleBuy} />,
    daily: (
      <DailyRewards
        bonusClaims={dailyBonusClaims}
        dailyClaimed={dailyClaimed}
        locale={locale}
        missions={missions}
        rewards={rewards}
        spinUsed={dailySpinUsed}
        streakDays={dailyStreakDays}
        onClaim={handleClaimReward}
        onMissionClaim={handleClaimMission}
        onSpin={handleSpinWheel}
        onRewardAd={handleRewardAd}
      />
    ),
    settings: (
      <Settings
        account={{ status: authStatus, profile: authProfile, userId: playerId, error: authError }}
        locale={locale}
        onLocaleChange={setLocale}
        onNewGuest={handleNewGuest}
        onSendMagicLink={handleSendMagicLink}
        onSignOut={handleSignOut}
      />
    ),
  }[route];

  return (
    <div className={`app-shell ${route === "match" ? "app-shell-match" : ""}`.trim()}>
      <header className="top-bar">
        <button className="brand-button" type="button" onClick={() => setRoute("home")}>
          <span className="brand-mark">M</span>
          <span>Mahjong Party</span>
        </button>
        <div className="top-currencies">
          <CurrencyPill kind="coins" label={t(locale, "currency.coins")} value={wallet.coins} />
          <CurrencyPill kind="gems" label={t(locale, "currency.gems")} value={wallet.gems} />
        </div>
      </header>

      <main className="app-main">
        <Suspense fallback={<div className="screen route-loading" aria-live="polite">Loading...</div>}>{screen}</Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {navItems.map((item) => (
          <Button
            key={item.route}
            tone={route === item.route ? "primary" : "ghost"}
            onClick={() => setRoute(item.route)}
          >
            {t(locale, item.labelKey)}
          </Button>
        ))}
      </nav>
      <Toast message={toast} />
    </div>
  );
}













