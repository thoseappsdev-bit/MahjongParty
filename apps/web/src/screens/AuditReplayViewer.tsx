import { useState } from "react";
import { Button, Panel } from "@mahjong/ui";
import type { MatchEvent } from "@mahjong/game-core";
import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";

export interface AuditReplayRow {
  id: string;
  sequence: number;
  actor: string;
  action: string;
  tile: string;
  context: string;
  occurredAt: string;
}

export function normalizeAuditReplayEvents(events: readonly MatchEvent[], playerNames: readonly string[]): AuditReplayRow[] {
  return events.map((event) => {
    const payload = event.action.payload ?? {};
    const tile = typeof payload.tile === "string" ? payload.tile : "None";
    const context =
      typeof payload.context === "string"
        ? payload.context
        : typeof payload.fromSeat === "number"
          ? `from seat ${payload.fromSeat + 1}`
          : event.source === "system"
            ? "Table state update"
            : "No extra context";

    return {
      id: `audit-${event.sequence}`,
      sequence: event.sequence,
      actor: actorLabel(event, playerNames),
      action: titleCase(event.action.type),
      tile,
      context,
      occurredAt: String(event.occurredAt),
    };
  });
}

export function moveAuditReplayCursor(currentIndex: number, delta: number, eventCount: number): number {
  if (eventCount <= 0) {
    return 0;
  }
  return Math.min(eventCount - 1, Math.max(0, currentIndex + delta));
}

export function AuditReplayViewer({
  events,
  playerNames,
}: {
  events: readonly MatchEvent[];
  playerNames: readonly string[];
}) {
  const rows = normalizeAuditReplayEvents(events, playerNames);
  const [cursor, setCursor] = useState(0);
  const current = rows[moveAuditReplayCursor(cursor, 0, rows.length)];

  if (!current) {
    return (
      <Panel className="audit-replay-panel">
        <div className="audit-replay-heading">
          <ListChecks aria-hidden="true" size={22} />
          <div>
            <h2>Audit Replay</h2>
            <p>No audit events are available for this hand yet.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="audit-replay-panel" aria-label="Audit replay viewer">
      <div className="audit-replay-heading">
        <ListChecks aria-hidden="true" size={22} />
        <div>
          <h2>Audit Replay</h2>
          <p>
            Event {current.sequence} of {rows.length}
          </p>
        </div>
      </div>

      <div className="audit-replay-current">
        <span className="audit-replay-sequence">#{current.sequence}</span>
        <div>
          <strong>{current.action}</strong>
          <span>{current.actor}</span>
        </div>
        <div>
          <small>Tile</small>
          <span>{current.tile}</span>
        </div>
        <div>
          <small>Context</small>
          <span>{current.context}</span>
        </div>
      </div>

      <div className="audit-replay-controls" aria-label="Replay timeline controls">
        <Button
          aria-label="Previous event"
          disabled={cursor === 0}
          tone="ghost"
          onClick={() => setCursor((index) => moveAuditReplayCursor(index, -1, rows.length))}
        >
          <ChevronLeft aria-hidden="true" size={18} />
          Previous event
        </Button>
        <input
          aria-label="Current event"
          max={rows.length - 1}
          min={0}
          onChange={(event) => setCursor(moveAuditReplayCursor(Number(event.target.value), 0, rows.length))}
          type="range"
          value={cursor}
        />
        <Button
          aria-label="Next event"
          disabled={cursor >= rows.length - 1}
          tone="ghost"
          onClick={() => setCursor((index) => moveAuditReplayCursor(index, 1, rows.length))}
        >
          Next event
          <ChevronRight aria-hidden="true" size={18} />
        </Button>
      </div>

      <ol className="audit-replay-list" aria-label="Audit event sequence">
        {rows.map((row, index) => (
          <li key={row.id} className={index === cursor ? "audit-replay-row active" : "audit-replay-row"}>
            <button type="button" onClick={() => setCursor(index)} aria-current={index === cursor ? "step" : undefined}>
              <span>#{row.sequence}</span>
              <strong>{row.actor}</strong>
              <em>{row.action}</em>
              <small>{row.tile}</small>
              <span>{row.context}</span>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function actorLabel(event: MatchEvent, playerNames: readonly string[]): string {
  if (typeof event.action.actorSeat !== "number") {
    return event.source === "system" ? "System" : "Unknown actor";
  }
  return playerNames[event.action.actorSeat] ?? `Seat ${event.action.actorSeat + 1}`;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
