export const tokens = {
  color: {
    emeraldDeep: "#0b3d2e",
    emeraldNight: "#071f19",
    jade: "#1f8a5b",
    jadeSoft: "#48b077",
    gold: "#d4af37",
    wood: "#6b4a2b",
    lantern: "#ffcf73",
    ink: "#13201a",
    cream: "#f5ecd8",
    danger: "#c0392b",
    text: "#fff8e7",
    muted: "#b9c7b8",
    border: "rgba(245, 236, 216, 0.18)",
  },
  radius: { sm: 6, md: 8, lg: 16 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  font: {
    display: '"Noto Serif SC", Georgia, serif',
    body: '"Inter", "Noto Sans SC", system-ui, sans-serif',
  },
  tile: { aspect: 0.74, minReadablePx: 34 },
} as const;

export type Tokens = typeof tokens;
