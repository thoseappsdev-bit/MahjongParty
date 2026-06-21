import { describe, expect, it, vi } from "vitest";
import { createMahjongSoundEffects } from "./soundEffects";
import type { AudioContextFactory, StorageLike } from "./soundEffects";

describe("mahjong sound effects", () => {
  it("starts with sound enabled when there is no saved mute preference", () => {
    const storage = memoryStorage();

    const effects = createMahjongSoundEffects(storage, audioFactory());

    expect(effects.isMuted()).toBe(false);
  });

  it("persists mute changes to mahjong sound storage", () => {
    const storage = memoryStorage();
    const effects = createMahjongSoundEffects(storage, audioFactory());

    effects.setMuted(true);

    expect(effects.isMuted()).toBe(true);
    expect(storage.getItem("mahjong:sound-muted")).toBe("true");

    const nextEffects = createMahjongSoundEffects(storage, audioFactory());
    expect(nextEffects.isMuted()).toBe(true);

    nextEffects.setMuted(false);
    expect(storage.getItem("mahjong:sound-muted")).toBe("false");
  });

  it("does not throw when an audio context is unavailable or blocked", () => {
    const effects = createMahjongSoundEffects(memoryStorage(), () => {
      throw new Error("AudioContext blocked");
    });

    expect(() => effects.unlock()).not.toThrow();
    expect(() => effects.play("tile")).not.toThrow();
    expect(() => effects.play("claim")).not.toThrow();
    expect(() => effects.play("kong")).not.toThrow();
    expect(() => effects.play("win")).not.toThrow();
  });

  it("does not create oscillators while muted", () => {
    const context = fakeAudioContext();
    const effects = createMahjongSoundEffects(memoryStorage({ "mahjong:sound-muted": "true" }), () => context);

    effects.unlock();
    effects.play("tile");

    expect(context.createOscillator).not.toHaveBeenCalled();
  });
});

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function audioFactory(): AudioContextFactory {
  return () => fakeAudioContext();
}

function fakeAudioContext() {
  const destination = {};
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const oscillator = {
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    type: "sine" as OscillatorType,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  return {
    currentTime: 10,
    destination,
    state: "running",
    resume: vi.fn(),
    createGain: vi.fn(() => gain),
    createOscillator: vi.fn(() => oscillator),
  };
}
