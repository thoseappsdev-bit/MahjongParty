export type ClientEventLevel = "info" | "warning" | "error";

export interface ClientEvent {
  type: string;
  level?: ClientEventLevel;
  message: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_METADATA_VALUE_LENGTH = 1200;

export function trackClientEvent(event: ClientEvent): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify(normalizeClientEvent(event));
  const blob = new Blob([payload], { type: "application/json" });

  if (navigator.sendBeacon?.("/api/analytics/events", blob)) {
    return;
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

export function normalizeClientEvent(event: ClientEvent): Required<ClientEvent> {
  return {
    type: truncate(event.type || "client.event", 80),
    level: event.level ?? "info",
    message: truncate(event.message || "Client event", MAX_MESSAGE_LENGTH),
    metadata: sanitizeMetadata(event.metadata ?? {}),
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return typeof error === "string" ? error : "Unknown client error";
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 20)
      .map(([key, value]) => [truncate(key, 80), sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return truncate(value, MAX_METADATA_VALUE_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeValue);
  }
  if (typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  return String(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

