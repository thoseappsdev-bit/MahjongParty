import { useEffect, useRef } from "react";
import type { MatchView } from "@mahjong/shared-types";
import { buildBoardCanvasModel, type BoardCanvasModel } from "./boardCanvasModel";

export function BoardCanvas({ view }: { view: MatchView }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard(context, buildBoardCanvasModel(view, { width, height }));
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [view]);

  return <canvas className="board-canvas" ref={canvasRef} aria-hidden="true" />;
}

function drawBoard(context: CanvasRenderingContext2D, model: BoardCanvasModel): void {
  context.clearRect(0, 0, model.size.width, model.size.height);
  drawFelt(context, model);
  drawSeatHighlights(context, model);
}

function drawFelt(context: CanvasRenderingContext2D, model: BoardCanvasModel): void {
  const gradient = context.createRadialGradient(
    model.size.width * 0.5,
    model.size.height * 0.5,
    10,
    model.size.width * 0.5,
    model.size.height * 0.5,
    Math.max(model.size.width, model.size.height) * 0.58,
  );
  gradient.addColorStop(0, "rgba(27, 112, 78, 0.4)");
  gradient.addColorStop(1, "rgba(5, 36, 29, 0.05)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, model.size.width, model.size.height);

  context.save();
  context.strokeStyle = "rgba(255, 207, 115, 0.16)";
  context.lineWidth = 1;
  roundRect(context, model.center.x, model.center.y, model.center.width, model.center.height, 10);
  context.stroke();
  context.restore();
}

function drawSeatHighlights(context: CanvasRenderingContext2D, model: BoardCanvasModel): void {
  for (const highlight of model.seatHighlights) {
    if (!highlight.active) {
      continue;
    }
    const { x, y, width, height } = highlight.rect;
    const gradient = context.createRadialGradient(x + width / 2, y + height / 2, 1, x + width / 2, y + height / 2, width / 2);
    gradient.addColorStop(0, "rgba(255, 207, 115, 0.22)");
    gradient.addColorStop(1, "rgba(255, 207, 115, 0)");
    context.fillStyle = gradient;
    roundRect(context, x, y, width, height, 18);
    context.fill();
  }
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
