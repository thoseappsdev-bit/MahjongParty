import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DailyRewards.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("DailyRewards layout", () => {
  it("uses unframed card headers instead of nesting reward chips inside panels", () => {
    expect(source).not.toContain("RewardChip");
    expect(source).toContain("DailyCardHeader");
    expect(source).toContain('className="daily-card-header"');
  });

  it("keeps desktop reward cards from overlapping or overflowing", () => {
    expect(styles).toMatch(/\.daily-actions\s*{[^}]*align-items:\s*stretch/s);
    expect(styles).toMatch(/\.daily-card\s*{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.daily-card-header\s*{/);
    expect(styles).toMatch(/\.daily-card-header\s+small\s*{[^}]*overflow-wrap:\s*anywhere/s);
    expect(styles).toMatch(/\.daily-card\s*>\s*\.mp-button\s*{[^}]*margin-top:\s*auto/s);
    expect(styles).toMatch(/\.odds-list\s+span\s*{[^}]*overflow-wrap:\s*anywhere/s);
  });
});
