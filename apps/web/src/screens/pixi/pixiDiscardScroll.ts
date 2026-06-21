export function nextDiscardScrollY(
  previousCount: number,
  nextCount: number,
  currentY: number,
  maxY: number,
): number {
  if (nextCount > previousCount) {
    return maxY;
  }

  return Math.min(Math.max(currentY, 0), maxY);
}
export function discardViewportClip(
  area: { x: number; y: number; width: number; height: number },
  mode: "desktop" | "mobile",
) {
  const leftInset = 2;
  const rightInset = 10;
  const topInset = mode === "desktop" ? 44 : 36;
  const bottomInset = 10;

  return {
    x: area.x + leftInset,
    y: area.y + topInset,
    width: Math.max(1, area.width - leftInset - rightInset),
    height: Math.max(1, area.height - topInset - bottomInset),
  };
}
