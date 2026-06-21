export type MahjongSoundEffect = "tile" | "claim" | "kong" | "win";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MahjongSoundEffects {
  play(effect: MahjongSoundEffect): void;
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export type AudioContextFactory = () => SoundAudioContext | null | undefined;

interface SoundAudioContext {
  currentTime: number;
  destination: unknown;
  state?: string;
  resume?: () => Promise<void> | void;
  createGain: () => SoundGainNode;
  createOscillator: () => SoundOscillatorNode;
}

interface SoundGainNode {
  gain: {
    setValueAtTime: (value: number, startTime: number) => void;
    linearRampToValueAtTime?: (value: number, endTime: number) => void;
    exponentialRampToValueAtTime?: (value: number, endTime: number) => void;
  };
  connect: (destination: unknown) => unknown;
}

interface SoundOscillatorNode {
  frequency: {
    setValueAtTime: (value: number, startTime: number) => void;
    exponentialRampToValueAtTime?: (value: number, endTime: number) => void;
  };
  type: OscillatorType;
  connect: (destination: unknown) => unknown;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

const STORAGE_KEY = "mahjong:sound-muted";

const EFFECTS: Record<MahjongSoundEffect, { frequency: number; endFrequency: number; duration: number; gain: number; type: OscillatorType }> = {
  tile: { frequency: 760, endFrequency: 520, duration: 0.07, gain: 0.055, type: "triangle" },
  claim: { frequency: 520, endFrequency: 740, duration: 0.11, gain: 0.06, type: "sine" },
  kong: { frequency: 330, endFrequency: 220, duration: 0.16, gain: 0.075, type: "sawtooth" },
  win: { frequency: 660, endFrequency: 990, duration: 0.22, gain: 0.08, type: "triangle" },
};

export function createMahjongSoundEffects(
  storage: StorageLike | undefined = defaultStorage(),
  audioFactory: AudioContextFactory = defaultAudioFactory,
): MahjongSoundEffects {
  let muted = readMuted(storage);
  let context: SoundAudioContext | null = null;

  const ensureContext = () => {
    if (context) {
      return context;
    }

    try {
      context = audioFactory() ?? null;
    } catch {
      context = null;
    }

    return context;
  };

  const resume = (audio: SoundAudioContext) => {
    try {
      if (audio.state === "suspended") {
        void audio.resume?.();
      }
    } catch {
      // Browser audio can be blocked until a user gesture; silence is fine.
    }
  };

  return {
    play(effect) {
      if (muted) {
        return;
      }

      try {
        const audio = ensureContext();
        if (!audio) {
          return;
        }

        resume(audio);
        playEffect(audio, effect);
      } catch {
        // Sound effects are decorative, so audio failures must not affect play.
      }
    },
    unlock() {
      try {
        const audio = ensureContext();
        if (audio) {
          resume(audio);
        }
      } catch {
        // No-op when the browser blocks or omits Web Audio.
      }
    },
    setMuted(nextMuted) {
      muted = nextMuted;
      try {
        storage?.setItem(STORAGE_KEY, String(nextMuted));
      } catch {
        // Persistence is best-effort.
      }
    },
    isMuted() {
      return muted;
    },
  };
}

function playEffect(audio: SoundAudioContext, effect: MahjongSoundEffect) {
  const cue = EFFECTS[effect];
  const now = audio.currentTime;
  const end = now + cue.duration;
  const gain = audio.createGain();
  const oscillator = audio.createOscillator();

  oscillator.type = cue.type;
  oscillator.frequency.setValueAtTime(cue.frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime?.(Math.max(1, cue.endFrequency), end);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime?.(cue.gain, now + 0.01);
  gain.gain.exponentialRampToValueAtTime?.(0.0001, end);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(end);
}

function readMuted(storage?: StorageLike) {
  try {
    return storage?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function defaultAudioFactory(): SoundAudioContext | null {
  const audioContext = getAudioContextConstructor();
  if (!audioContext) {
    return null;
  }

  return new audioContext();
}

function getAudioContextConstructor(): (new () => SoundAudioContext) | undefined {
  const globalAudio = globalThis as typeof globalThis & {
    webkitAudioContext?: new () => SoundAudioContext;
  };

  return (globalAudio.AudioContext as new () => SoundAudioContext) ?? globalAudio.webkitAudioContext;
}
