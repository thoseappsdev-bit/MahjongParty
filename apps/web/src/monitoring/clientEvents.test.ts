import { describe, expect, it } from "vitest";
import { normalizeClientEvent } from "./clientEvents";

describe("client event normalization", () => {
  it("bounds client telemetry before it is sent", () => {
    const normalized = normalizeClientEvent({
      type: "x".repeat(120),
      message: "m".repeat(700),
      metadata: {
        stack: "s".repeat(2000),
        nested: { value: "v".repeat(1500) },
      },
      occurredAt: "2026-06-21T00:00:00.000Z",
    });

    expect(normalized.type.length).toBeLessThanOrEqual(80);
    expect(normalized.message.length).toBeLessThanOrEqual(500);
    expect(String(normalized.metadata.stack).length).toBeLessThanOrEqual(1200);
    expect((normalized.metadata.nested as { value: string }).value.length).toBeLessThanOrEqual(1200);
  });
});
