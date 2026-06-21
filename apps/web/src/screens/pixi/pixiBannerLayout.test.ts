import { describe, expect, it } from "vitest";
import { buildPixiBannerMetrics, claimBannerCenterY } from "./pixiBannerLayout";

describe("pixi banner layout", () => {
  it("wraps long tutorial copy on a narrow board", () => {
    const metrics = buildPixiBannerMetrics(
      "Tutorial: Bo Bot discarded 1M. Chi uses your 2M and 3M to complete a 1-2-3 sequence.",
      266,
    );

    expect(metrics.width).toBeLessThanOrEqual(266);
    expect(metrics.lineCount).toBeGreaterThanOrEqual(2);
    expect(metrics.height).toBeGreaterThan(32);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(10);
  });

  it("keeps the same tutorial copy on one line when desktop space allows", () => {
    const metrics = buildPixiBannerMetrics(
      "Tutorial: Bo Bot discarded 1M. Chi uses your 2M and 3M to complete a 1-2-3 sequence.",
      660,
    );

    expect(metrics.lineCount).toBe(1);
    expect(metrics.height).toBe(32);
  });

  it("places the mobile claim banner below the discard field", () => {
    const discardArea = { x: 40, y: 190, width: 300, height: 175 };

    expect(claimBannerCenterY("mobile", discardArea)).toBeGreaterThan(discardArea.y + discardArea.height);
    expect(claimBannerCenterY("desktop", discardArea)).toBeLessThan(discardArea.y + discardArea.height);
  });});

