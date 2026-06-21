import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(process.cwd(), "apps/web/public/assets/tiles/old-hk");
await mkdir(outDir, { recursive: true });

const tileWidth = 120;
const tileHeight = 162;

const suitMeta = {
  m: { color: "#b8322a", accent: "#8d241f", label: "\u842c" },
  p: { color: "#1f6fb2", accent: "#b8322a", label: "\u7b52" },
  s: { color: "#148457", accent: "#0d5f3f", label: "\u7d22" },
};

const honors = [
  ["we", "\u6771", "#1f8a5b"],
  ["ws", "\u5357", "#1f8a5b"],
  ["ww", "\u897f", "#1f8a5b"],
  ["wn", "\u5317", "#1f8a5b"],
  ["dr", "\u4e2d", "#b8322a"],
  ["dg", "\u767c", "#1f8a5b"],
  ["dw", "\u767d", "#334155"],
];

const bonus = [
  ["f1", "\u6885", "#b8322a", "1"],
  ["f2", "\u862d", "#1f8a5b", "2"],
  ["f3", "\u83ca", "#c18a1a", "3"],
  ["f4", "\u7af9", "#1f8a5b", "4"],
  ["t1", "\u6625", "#1f8a5b", "1"],
  ["t2", "\u590f", "#b8322a", "2"],
  ["t3", "\u79cb", "#c18a1a", "3"],
  ["t4", "\u51ac", "#1f6fb2", "4"],
];

for (const suit of Object.keys(suitMeta)) {
  for (let rank = 1; rank <= 9; rank += 1) {
    await save(`${suit}${rank}`, tileFrame(renderSuitTile(suit, rank)));
  }
}

for (const [code, label, color] of honors) {
  await save(code, tileFrame(renderHonor(label, color)));
}

for (const [code, label, color, rank] of bonus) {
  await save(code, tileFrame(renderBonus(label, color, rank)));
}

console.log(`generated ${27 + honors.length + bonus.length} tile SVGs in ${outDir}`);

async function save(code, svg) {
  await writeFile(join(outDir, `${code}.svg`), svg, "utf8");
}

function tileFrame(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight}" viewBox="0 0 ${tileWidth} ${tileHeight}" role="img">
  <defs>
    <linearGradient id="face" x1="18" y1="10" x2="102" y2="152" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fff7e5"/>
      <stop offset="0.62" stop-color="#eadbb7"/>
      <stop offset="1" stop-color="#cdbb91"/>
    </linearGradient>
    <linearGradient id="edge" x1="20" y1="14" x2="104" y2="156" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f4ead0"/>
      <stop offset="1" stop-color="#a98c5e"/>
    </linearGradient>
    <filter id="shadow" x="-15%" y="-12%" width="130%" height="130%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#2f2114" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="8" y="6" width="104" height="150" rx="13" fill="url(#edge)" filter="url(#shadow)"/>
  <rect x="13" y="10" width="94" height="139" rx="10" fill="url(#face)"/>
  <path d="M23 19h73M23 139h73" stroke="#fffdf1" stroke-opacity="0.52" stroke-width="3" stroke-linecap="round"/>
  <path d="M101 24v108" stroke="#9b7c50" stroke-opacity="0.24" stroke-width="4" stroke-linecap="round"/>
  ${content}
</svg>
`;
}

function renderSuitTile(suit, rank) {
  if (suit === "m") {
    return renderMan(rank);
  }

  if (suit === "p") {
    return renderPins(rank);
  }

  return renderBamboo(rank);
}

function renderMan(rank) {
  const meta = suitMeta.m;
  return `
  ${text(rank, 30, 45, 42, meta.color, "Inter, Arial, sans-serif", 900)}
  ${text(meta.label, 60, 100, 48, meta.accent, "'Noto Serif SC', 'SimSun', serif", 900)}
  ${text("MAN", 60, 132, 12, "#315545", "Inter, Arial, sans-serif", 800)}
  `;
}

function renderPins(rank) {
  const points = pipPoints(rank);
  return `
  ${points
    .map(
      ([x, y], index) => `
  <circle cx="${x}" cy="${y}" r="11" fill="${index % 2 === 0 ? suitMeta.p.color : suitMeta.p.accent}" opacity="0.95"/>
  <circle cx="${x}" cy="${y}" r="6" fill="#fff7e5" opacity="0.9"/>
  <circle cx="${x}" cy="${y}" r="2.6" fill="${index % 2 === 0 ? suitMeta.p.accent : suitMeta.p.color}"/>`,
    )
    .join("")}
  ${text(rank, 26, 130, 26, suitMeta.p.color, "Inter, Arial, sans-serif", 900)}
  ${text(suitMeta.p.label, 78, 132, 20, "#315545", "'Noto Serif SC', 'SimSun', serif", 900)}
  `;
}

function renderBamboo(rank) {
  const points = pipPoints(rank);
  return `
  ${points
    .map(
      ([x, y], index) => `
  <g transform="translate(${x} ${y}) rotate(${index % 2 === 0 ? -7 : 7})">
    <path d="M0 -17 C2 -9 -2 -2 0 6 C2 12 0 17 0 20" fill="none" stroke="${suitMeta.s.color}" stroke-width="5.8" stroke-linecap="round"/>
    <path d="M-7 -8 C-15 -13 -14 -20 -4 -17 C-9 -13 -8 -10 -7 -8Z" fill="${suitMeta.s.color}" opacity="0.92"/>
    <path d="M7 1 C16 -3 16 -11 5 -10 C10 -6 9 -2 7 1Z" fill="${suitMeta.s.color}" opacity="0.92"/>
    <path d="M-7 11 C-15 7 -14 0 -4 2 C-9 5 -8 9 -7 11Z" fill="${suitMeta.s.accent}" opacity="0.9"/>
    <path d="M-6 -3h12M-6 7h12" stroke="#fff7e5" stroke-width="2" stroke-linecap="round" opacity="0.72"/>
  </g>`,
    )
    .join("")}
  ${text(rank, 26, 130, 26, suitMeta.s.color, "Inter, Arial, sans-serif", 900)}
  ${text(suitMeta.s.label, 78, 132, 20, "#315545", "'Noto Serif SC', 'SimSun', serif", 900)}
  `;
}

function renderHonor(label, color) {
  const isWhite = label === "\u767d";
  return `
  <rect x="31" y="36" width="58" height="70" rx="8" fill="${isWhite ? "none" : "rgba(255,255,255,0.18)"}" stroke="${color}" stroke-width="${isWhite ? 5 : 0}" opacity="0.92"/>
  ${text(label, 60, 93, 56, color, "'Noto Serif SC', 'SimSun', serif", 900)}
  ${text("HONOR", 60, 130, 12, "#315545", "Inter, Arial, sans-serif", 800)}
  `;
}

function renderBonus(label, color, rank) {
  return `
  <path d="M60 34c8 13 19 15 26 9-1 16-9 26-26 25-17 1-25-9-26-25 7 6 18 4 26-9Z" fill="${color}" opacity="0.18"/>
  ${text(label, 60, 91, 48, color, "'Noto Serif SC', 'SimSun', serif", 900)}
  ${text(rank, 30, 130, 26, color, "Inter, Arial, sans-serif", 900)}
  ${text("BONUS", 72, 132, 12, "#315545", "Inter, Arial, sans-serif", 800)}
  `;
}

function pipPoints(rank) {
  const map = {
    1: [[60, 72]],
    2: [
      [43, 52],
      [77, 92],
    ],
    3: [
      [43, 50],
      [60, 72],
      [77, 94],
    ],
    4: [
      [42, 50],
      [78, 50],
      [42, 94],
      [78, 94],
    ],
    5: [
      [42, 49],
      [78, 49],
      [60, 72],
      [42, 95],
      [78, 95],
    ],
    6: [
      [42, 43],
      [78, 43],
      [42, 72],
      [78, 72],
      [42, 101],
      [78, 101],
    ],
    7: [
      [42, 39],
      [78, 39],
      [60, 61],
      [42, 82],
      [78, 82],
      [42, 104],
      [78, 104],
    ],
    8: [
      [42, 37],
      [78, 37],
      [42, 59],
      [78, 59],
      [42, 82],
      [78, 82],
      [42, 104],
      [78, 104],
    ],
    9: [
      [42, 36],
      [78, 36],
      [42, 57],
      [78, 57],
      [60, 72],
      [42, 88],
      [78, 88],
      [42, 109],
      [78, 109],
    ],
  };

  return map[rank];
}

function text(value, x, y, size, fill, family, weight) {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}">${escapeXml(value)}</text>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

