export interface PixiBannerMetrics {
  width: number;
  height: number;
  fontSize: number;
  lineCount: number;
  textWidth: number;
}

export function buildPixiBannerMetrics(label: string, maxWidth: number): PixiBannerMetrics {
  const width = Math.max(160, Math.min(maxWidth, label.length * 7 + 34));
  const fontSize = width < 360 ? 10 : 12;
  const textWidth = Math.max(120, width - 28);
  const estimatedTextWidth = label.length * fontSize * 0.52;
  const lineCount = Math.max(1, Math.ceil(estimatedTextWidth / textWidth));
  const height = lineCount === 1 ? 32 : 14 + lineCount * (fontSize + 3);

  return { width, height, fontSize, lineCount, textWidth };
}
export function claimBannerCenterY(
  mode: "desktop" | "mobile",
  discardArea: { y: number; height: number },
): number {
  return discardArea.y + discardArea.height + (mode === "mobile" ? 24 : -26);
}

