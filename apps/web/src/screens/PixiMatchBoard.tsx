import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchIntent, MatchView } from "@mahjong/shared-types";
import { pixiTableSkinPath, pixiTileBackPath, pixiTileFrontPath, collectPixiBoardAssetPaths } from "./pixi/pixiBoardAssets";
import { buildPixiBoardLayout, type PixiBoardLayout, type PixiBoardTile } from "./pixi/pixiBoardLayout";
import { discardViewportClip, nextDiscardScrollY } from "./pixi/pixiDiscardScroll";
import { buildPixiBannerMetrics, claimBannerCenterY } from "./pixi/pixiBannerLayout";
import { classifyPixiBoardEvents, type PixiBoardVisualEvent } from "./pixi/pixiBoardEvents";
import { createMahjongSoundEffects, type MahjongSoundEffects } from "./pixi/soundEffects";
import type { PixiRuntimeModule } from "./pixi/pixiRuntime";

interface PixiMatchBoardProps {
  canDiscard: boolean;
  tutorialScenarioBanner: string | null;
  view: MatchView;
  onAction: (intent: MatchIntent) => void;
  onRendererError: () => void;
}

interface PixiRuntime {
  pixi: PixiRuntimeModule;
  app: import("pixi.js").Application;
  layer: import("pixi.js").Container;
  effects: import("pixi.js").Container;
  sound: MahjongSoundEffects;
  loadedAssets: Set<string>;
  assetLoadId: number;
}


export function PixiMatchBoard({
  canDiscard,
  tutorialScenarioBanner,
  view,
  onAction,
  onRendererError,
}: PixiMatchBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);
  const previousViewRef = useRef<MatchView | null>(null);
  const layoutRef = useRef<PixiBoardLayout | null>(null);
  const discardScrollRef = useRef(0);
  const previousDiscardCountRef = useRef(0);
  const discardDragRef = useRef<{ pointerId: number; startY: number; startScrollY: number } | null>(null);
  const onActionRef = useRef(onAction);
  const onRendererErrorRef = useRef(onRendererError);
  const [viewport, setViewport] = useState({ width: 960, height: 560 });
  const [rendererReady, setRendererReady] = useState(false);
  const [discardScrollY, setDiscardScrollY] = useState(0);
  const reduceMotion = useMemo(() => shouldReduceMotion(), []);

  onActionRef.current = onAction;
  onRendererErrorRef.current = onRendererError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const resize = () => {
      const rect = host.getBoundingClientRect();
      setViewport({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(420, Math.round(rect.height)),
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function mountPixi() {
      try {
        const { pixiRuntime: pixi } = await import("./pixi/pixiRuntime");
        const app = new pixi.Application();
        await app.init({
          width: viewport.width,
          height: viewport.height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });

        if (cancelled) {
          app.destroy(true);
          return;
        }

        const layer = new pixi.Container();
        const effects = new pixi.Container();
        app.stage.addChild(layer, effects);
        app.canvas.className = "pixi-board-canvas";
        hostRef.current?.appendChild(app.canvas);
        runtimeRef.current = {
          pixi,
          app,
          layer,
          effects,
          sound: createMahjongSoundEffects(),
          loadedAssets: new Set<string>(),
          assetLoadId: 0,
        };
        setRendererReady(true);
      } catch {
        onRendererErrorRef.current();
      }
    }

    void mountPixi();

    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      setRendererReady(false);
      runtime?.app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }

    runtime.app.renderer.resize(viewport.width, viewport.height);
    const layout = buildPixiBoardLayout(view, viewport);
    layoutRef.current = layout;
    const discardCount = view.players.reduce((total, player) => total + player.discards.length, 0);
    const safeDiscardScrollY = nextDiscardScrollY(
      previousDiscardCountRef.current,
      discardCount,
      discardScrollY,
      layout.discardScrollMax,
    );
    previousDiscardCountRef.current = discardCount;
    if (safeDiscardScrollY !== discardScrollY) {
      discardScrollRef.current = safeDiscardScrollY;
      setDiscardScrollY(safeDiscardScrollY);
      return;
    }

    discardScrollRef.current = safeDiscardScrollY;
    const events = classifyPixiBoardEvents(previousViewRef.current, view);
    previousViewRef.current = view;
    renderWhenAssetsReady(runtime, layout, view, canDiscard, tutorialScenarioBanner, onActionRef.current, events, reduceMotion, safeDiscardScrollY, onRendererErrorRef.current);
  }, [canDiscard, discardScrollY, reduceMotion, rendererReady, tutorialScenarioBanner, view, viewport]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scrollTo = (nextScrollY: number) => {
      const max = layoutRef.current?.discardScrollMax ?? 0;
      const clamped = clamp(nextScrollY, 0, max);
      discardScrollRef.current = clamped;
      setDiscardScrollY(clamped);
    };

    const localPoint = (event: PointerEvent | WheelEvent) => {
      const rect = host.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const isInDiscardArea = (event: PointerEvent | WheelEvent) => {
      const layout = layoutRef.current;
      if (!layout || layout.discardScrollMax <= 0) {
        return false;
      }

      const point = localPoint(event);
      return (
        point.x >= layout.discardArea.x &&
        point.x <= layout.discardArea.x + layout.discardArea.width &&
        point.y >= layout.discardArea.y &&
        point.y <= layout.discardArea.y + layout.discardArea.height
      );
    };

    const onWheel = (event: WheelEvent) => {
      if (!isInDiscardArea(event)) {
        return;
      }

      event.preventDefault();
      scrollTo(discardScrollRef.current + event.deltaY);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isInDiscardArea(event)) {
        return;
      }

      discardDragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollY: discardScrollRef.current,
      };
      host.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = discardDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      scrollTo(drag.startScrollY - (event.clientY - drag.startY));
    };

    const stopDrag = (event: PointerEvent) => {
      const drag = discardDragRef.current;
      if (drag?.pointerId === event.pointerId) {
        discardDragRef.current = null;
        host.releasePointerCapture?.(event.pointerId);
      }
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", stopDrag);
    host.addEventListener("pointercancel", stopDrag);

    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", stopDrag);
      host.removeEventListener("pointercancel", stopDrag);
    };
  }, [rendererReady]);

  useEffect(() => {
    const unlock = () => runtimeRef.current?.sound.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return <div ref={hostRef} className="pixi-board-host" aria-hidden="true" />;
}

function renderWhenAssetsReady(
  runtime: PixiRuntime,
  layout: PixiBoardLayout,
  view: MatchView,
  canDiscard: boolean,
  tutorialScenarioBanner: string | null,
  onAction: (intent: MatchIntent) => void,
  events: PixiBoardVisualEvent[],
  reduceMotion: boolean,
  discardScrollY: number,
  onRendererError: () => void,
) {
  const assetPaths = collectPixiBoardAssetPaths(view);
  const missingAssets = assetPaths.filter((path) => !runtime.loadedAssets.has(path));

  if (missingAssets.length === 0) {
    drawBoard(runtime, layout, view, canDiscard, tutorialScenarioBanner, onAction, discardScrollY);
    playEvents(runtime, layout, events, reduceMotion);
    return;
  }

  const loadId = runtime.assetLoadId + 1;
  runtime.assetLoadId = loadId;
  void runtime.pixi.Assets.load(missingAssets)
    .then(() => {
      for (const path of missingAssets) {
        runtime.loadedAssets.add(path);
      }

      if (runtimeRefCurrent(runtime) && runtime.assetLoadId === loadId) {
        drawBoard(runtime, layout, view, canDiscard, tutorialScenarioBanner, onAction, discardScrollY);
        playEvents(runtime, layout, events, reduceMotion);
      }
    })
    .catch(() => onRendererError());
}

function runtimeRefCurrent(runtime: PixiRuntime): boolean {
  return runtime.app.renderer !== undefined;
}

function drawBoard(
  runtime: PixiRuntime,
  layout: PixiBoardLayout,
  view: MatchView,
  canDiscard: boolean,
  tutorialScenarioBanner: string | null,
  onAction: (intent: MatchIntent) => void,
  discardScrollY: number,
) {
  runtime.layer.removeChildren();

  const background = runtime.pixi.Sprite.from(pixiTableSkinPath);
  background.width = layout.viewport.width;
  background.height = layout.viewport.height;
  runtime.layer.addChild(background);

  runtime.layer.addChild(roundedRect(runtime, layout.table.x, layout.table.y, layout.table.width, layout.table.height, 10, 0x08281e, 0.08, 0xd4af37, 0.18));
  runtime.layer.addChild(roundedRect(runtime, layout.discardArea.x, layout.discardArea.y, layout.discardArea.width, layout.discardArea.height, 8, 0x08281e, 0.44, 0xd4af37, 0.36));
  runtime.layer.addChild(textNode(runtime, "East Round", layout.viewport.width / 2, layout.discardArea.y + 24, 13, 0xffcf73, "center", true));

  const discardLayer = new runtime.pixi.Container();
  const discardClip = discardViewportClip(layout.discardArea, layout.mode);
  const discardMask = new runtime.pixi.Graphics()
    .rect(discardClip.x, discardClip.y, discardClip.width, discardClip.height)
    .fill({ color: 0xffffff });
  discardLayer.y = -clamp(discardScrollY, 0, layout.discardScrollMax);
  discardLayer.mask = discardMask;
  runtime.layer.addChild(discardMask, discardLayer);

  for (const seat of layout.seats) {
    const player = view.players[seat.seat];
    if (seat.seat !== view.mySeat) {
      runtime.layer.addChild(labelNode(runtime, seat.label, player.avatar, player.handCount));
      for (const tile of seat.concealedTiles) {
        runtime.layer.addChild(tileSprite(runtime, tile, pixiTileBackPath));
      }
      for (const badge of seat.meldBadges) {
        runtime.layer.addChild(badgeNode(runtime, badge.x, badge.y, badge.width, badge.height, displayMeld(badge.text)));
      }
    }
    for (const tile of seat.discardTiles) {
      discardLayer.addChild(tileSprite(runtime, tile, tileAssetPath(tile.code ?? "")));
    }
  }

  if (layout.discardScrollMax > 0) {
    runtime.layer.addChild(scrollbarNode(runtime, layout, discardScrollY));
  }

  if (view.claimPrompt) {
    runtime.layer.addChild(bannerNode(runtime, view.claimPrompt, layout.viewport.width / 2, claimBannerCenterY(layout.mode, layout.discardArea), layout.table.width * 0.72));
  }

  if (tutorialScenarioBanner) {
    runtime.layer.addChild(bannerNode(runtime, tutorialScenarioBanner, layout.viewport.width / 2, layout.discardArea.y - 18, layout.table.width * 0.72));
  }

  const localPlayer = view.players[view.mySeat];
  runtime.layer.addChild(labelNode(runtime, layout.seats[view.mySeat].label, localPlayer.avatar, localPlayer.handCount));
  for (const badge of layout.seats[view.mySeat].meldBadges) {
    runtime.layer.addChild(badgeNode(runtime, badge.x, badge.y, badge.width, badge.height, displayMeld(badge.text)));
  }
  for (const tile of layout.localHand) {
    const sprite = tileSprite(runtime, tile, tileAssetPath(tile.code ?? ""), canDiscard ? 1 : 0.72);
    if (tile.code && canDiscard) {
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointertap", () => {
        runtime.sound.unlock();
        runtime.sound.play("tile");
        onAction({ type: "discard", tile: tile.code ?? "" });
      });
    }
    runtime.layer.addChild(sprite);
  }
}

function playEvents(runtime: PixiRuntime, layout: PixiBoardLayout, events: PixiBoardVisualEvent[], reduceMotion: boolean) {
  if (events.length === 0) {
    return;
  }

  const strongest = events.at(-1);
  if (!strongest) {
    return;
  }

  if (strongest.type === "discard" || strongest.type === "draw") {
    runtime.sound.play("tile");
  } else if (strongest.type === "claim") {
    runtime.sound.play("claim");
  } else if (strongest.type === "kong") {
    runtime.sound.play("kong");
  } else if (strongest.type === "win") {
    runtime.sound.play("win");
  }

  if (reduceMotion) {
    return;
  }

  const label = layout.seats[strongest.seat].label;
  const pulse = roundedRect(runtime, label.x - 8, label.y - 8, label.width + 16, label.height + 16, 16, effectColor(strongest.type), 0.32, 0xffcf73, 0.72);
  runtime.effects.addChild(pulse);

  let age = 0;
  const tick = () => {
    age += 1;
    const progress = Math.min(1, age / 34);
    pulse.alpha = 1 - progress;
    pulse.scale.set(1 + progress * 0.25);
    if (progress >= 1) {
      runtime.app.ticker.remove(tick);
      runtime.effects.removeChild(pulse);
      pulse.destroy();
    }
  };
  runtime.app.ticker.add(tick);
}

function scrollbarNode(runtime: PixiRuntime, layout: PixiBoardLayout, scrollY: number) {
  const trackWidth = 5;
  const trackPadding = 8;
  const trackHeight = Math.max(1, layout.discardArea.height - trackPadding * 2);
  const visibleRatio = layout.discardArea.height / (layout.discardArea.height + layout.discardScrollMax);
  const thumbHeight = Math.max(26, trackHeight * visibleRatio);
  const travel = Math.max(0, trackHeight - thumbHeight);
  const thumbY = layout.discardArea.y + trackPadding + travel * (clamp(scrollY, 0, layout.discardScrollMax) / layout.discardScrollMax);
  const x = layout.discardArea.x + layout.discardArea.width - trackPadding - trackWidth;
  const container = new runtime.pixi.Container();

  container.addChild(roundedRect(runtime, x, layout.discardArea.y + trackPadding, trackWidth, trackHeight, trackWidth / 2, 0x071f19, 0.62, 0xd4af37, 0.16));
  container.addChild(roundedRect(runtime, x, thumbY, trackWidth, thumbHeight, trackWidth / 2, 0xffcf73, 0.78, 0xffcf73, 0.24));
  return container;
}

function tileSprite(runtime: PixiRuntime, tile: PixiBoardTile, path: string, alpha = 1) {
  const sprite = runtime.pixi.Sprite.from(path);
  sprite.x = tile.x;
  sprite.y = tile.y;
  sprite.width = tile.width;
  sprite.height = tile.height;
  sprite.angle = tile.rotation;
  sprite.alpha = alpha;
  return sprite;
}

function labelNode(runtime: PixiRuntime, label: { x: number; y: number; width: number; height: number; text: string; active: boolean; rotation: number }, avatar: string, handCount: number) {
  const container = new runtime.pixi.Container();
  const width = label.width;
  const height = label.height;
  const centerY = height / 2;
  const textX = height + 4;
  const desktop = height >= 44;
  container.pivot.set(width / 2, height / 2);
  container.position.set(label.x + width / 2, label.y + height / 2);
  container.angle = label.rotation;

  container.addChild(roundedRect(runtime, 0, 0, width, height, height / 2, 0x071f19, label.active ? 0.9 : 0.76, label.active ? 0xffcf73 : 0xd4af37, label.active ? 0.68 : 0.3));
  container.addChild(circleNode(runtime, centerY, centerY, centerY - 3, 0xd4af37));
  container.addChild(textNode(runtime, avatar, centerY, centerY, desktop ? 13 : 11, 0x10231a, "center", true));
  container.addChild(textNode(runtime, label.text.replace(/^[ESWN] /, ""), textX, height * 0.34, desktop ? 15 : 12, 0xfff8e8, "left", true));
  container.addChild(textNode(runtime, `${handCount} tiles`, textX, height * 0.7, desktop ? 12 : 10, 0xcfe9d3, "left", false));
  return container;
}

function badgeNode(runtime: PixiRuntime, x: number, y: number, width: number, height: number, label: string) {
  const container = new runtime.pixi.Container();
  container.x = x;
  container.y = y;
  container.addChild(roundedRect(runtime, 0, 0, width, height, 6, 0x071f19, 0.84, 0xd4af37, 0.52));
  container.addChild(textNode(runtime, label, width / 2, height / 2 + 1, 10, 0xffcf73, "center", true));
  return container;
}

function bannerNode(runtime: PixiRuntime, label: string, x: number, y: number, maxWidth: number) {
  const metrics = buildPixiBannerMetrics(label, maxWidth);
  const container = new runtime.pixi.Container();
  container.x = x - metrics.width / 2;
  container.y = y - metrics.height / 2;
  container.addChild(roundedRect(runtime, 0, 0, metrics.width, metrics.height, 16, 0x1f4f38, 0.94, 0xd4af37, 0.45));

  const text = new runtime.pixi.Text({
    text: label,
    style: {
      align: "center",
      breakWords: true,
      fill: 0xffcf73,
      fontFamily: "Arial, sans-serif",
      fontSize: metrics.fontSize,
      fontWeight: "800",
      lineHeight: metrics.fontSize + 3,
      wordWrap: true,
      wordWrapWidth: metrics.textWidth,
    },
  });
  text.anchor.set(0.5);
  text.position.set(metrics.width / 2, metrics.height / 2 + 1);
  container.addChild(text);
  return container;
}

function roundedRect(runtime: PixiRuntime, x: number, y: number, width: number, height: number, radius: number, fill: number, alpha: number, stroke: number, strokeAlpha: number) {
  return new runtime.pixi.Graphics()
    .roundRect(x, y, width, height, radius)
    .fill({ color: fill, alpha })
    .stroke({ width: 1, color: stroke, alpha: strokeAlpha });
}

function circleNode(runtime: PixiRuntime, x: number, y: number, radius: number, fill: number) {
  return new runtime.pixi.Graphics().circle(x, y, radius).fill({ color: fill, alpha: 1 });
}

function textNode(runtime: PixiRuntime, label: string, x: number, y: number, size: number, fill: number, align: "left" | "center", bold: boolean) {
  const text = new runtime.pixi.Text({
    text: label,
    style: {
      align,
      fill,
      fontFamily: "Arial, sans-serif",
      fontSize: size,
      fontWeight: bold ? "800" : "500",
    },
  });
  text.anchor.set(align === "center" ? 0.5 : 0, 0.5);
  text.x = x;
  text.y = y;
  return text;
}

function tileAssetPath(code: string): string {
  return code ? `/assets/tiles/old-hk/${code.toLowerCase()}.svg` : pixiTileFrontPath;
}

function displayMeld(meld: string): string {
  return meld
    .split(" ")
    .map((part, index) => (index === 0 ? part.toUpperCase() : displayTile(part)))
    .join(" ");
}

function displayTile(code: string): string {
  return code.toUpperCase();
}

function effectColor(type: PixiBoardVisualEvent["type"]): number {
  return {
    discard: 0xffcf73,
    draw: 0x7dd3a6,
    claim: 0xffcf73,
    kong: 0xffb347,
    win: 0xfff8a8,
    turn: 0x7dd3a6,
  }[type];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function shouldReduceMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
















