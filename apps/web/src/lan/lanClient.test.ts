import { describe, expect, it } from "vitest";
import { resolveLanApiBase } from "./lanClient";

describe("LAN client", () => {
  it("uses same-origin APIs for production Worker/custom-domain builds", () => {
    expect(resolveLanApiBase({ protocol: "https:", hostname: "mahjong.example.com", search: "" }, true)).toBe("");
    expect(resolveLanApiBase({ protocol: "https:", hostname: "mahjong-party.youraimates.workers.dev", search: "" }, true)).toBe("");
  });

  it("uses same-origin APIs inside Discord Activity launches", () => {
    expect(resolveLanApiBase({ protocol: "https:", hostname: "localhost", search: "?frame_id=abc&instance_id=xyz&platform=desktop" }, false)).toBe("");
  });

  it("uses the local LAN server port during browser development", () => {
    expect(resolveLanApiBase({ protocol: "http:", hostname: "127.0.0.1", search: "" }, false)).toBe("http://127.0.0.1:8787");
    expect(resolveLanApiBase({ protocol: "http:", hostname: "192.168.68.113", search: "" }, false)).toBe(
      "http://192.168.68.113:8787",
    );
  });
});
