import type { MatchEvent } from "../action-log";
import type { RiichiTile } from "./tiles";

export type RiichiActionType = "chi" | "pong" | "kong" | "riichi" | "win" | "discard" | "pass";
export type RiichiRoundWind = "we" | "ws";
export type RiichiMeldKind = "chow" | "pung" | "kong";
export type RiichiFuriten = "none" | "discard" | "temporary" | "riichi";
export type RiichiPhase = "playing" | "complete";
export type RiichiSeat = 0 | 1 | 2 | 3;

export interface RiichiActionInput {
  seat: RiichiSeat;
  type: RiichiActionType;
  tile?: RiichiTile;
}

export interface RiichiActionOffer {
  seat: RiichiSeat;
  type: RiichiActionType;
  tile?: RiichiTile;
  discardChoices?: RiichiTile[];
}

export interface RiichiMeld {
  kind: RiichiMeldKind;
  tiles: RiichiTile[];
  open: boolean;
  calledTile?: RiichiTile;
  fromSeat?: RiichiSeat;
}

export interface RiichiPlayerState {
  seat: RiichiSeat;
  name: string;
  avatar: string;
  hand: RiichiTile[];
  discards: RiichiTile[];
  melds: RiichiMeld[];
  points: number;
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  furiten: RiichiFuriten;
  isBot: boolean;
}

export interface RiichiMatchContext {
  roundWind: RiichiRoundWind;
  handNumber: number;
  dealerSeat: RiichiSeat;
  honba: number;
  riichiSticks: number;
}

export interface RiichiMatchState {
  mode: "riichi";
  phase: RiichiPhase;
  seed: string;
  context: RiichiMatchContext;
  turnSeat: RiichiSeat;
  liveWall: RiichiTile[];
  deadWall: RiichiTile[];
  doraIndicators: RiichiTile[];
  uraDoraIndicators: RiichiTile[];
  kanDoraIndicators: RiichiTile[];
  players: [RiichiPlayerState, RiichiPlayerState, RiichiPlayerState, RiichiPlayerState];
  claimWindow: null;
  result: null;
  eventLog: string[];
  auditLog: MatchEvent[];
}
