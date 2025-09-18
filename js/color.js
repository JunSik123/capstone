const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const MFDS_COLORS = [
  { name: "하양", aliases: ["흰색", "백색", "white"], reference: [245, 245, 245] },
  { name: "노랑", aliases: ["황색", "yellow"], reference: [242, 210, 96] },
  { name: "주황", aliases: ["오렌지", "orange"], reference: [236, 148, 63] },
  { name: "분홍", aliases: ["핑크", "pink"], reference: [236, 160, 180] },
  { name: "빨강", aliases: ["적색", "red"], reference: [208, 62, 62] },
  { name: "갈색", aliases: ["브라운", "brown"], reference: [141, 93, 59] },
  { name: "연두", aliases: ["연한초록", "라임"], reference: [186, 219, 102] },
  { name: "초록", aliases: ["녹색", "green"], reference: [74, 158, 93] },
  { name: "청록", aliases: ["민트", "teal"], reference: [72, 180, 170] },
  { name: "파랑", aliases: ["청색", "blue"], reference: [74, 120, 210] },
  { name: "남색", aliases: ["남빛", "navy"], reference: [46, 63, 146] },
  { name: "보라", aliases: ["자주", "purple"], reference: [130, 84, 190] },
  { name: "회색", aliases: ["회", "gray"], reference: [166, 170, 176] },
  { name: "검정", aliases: ["흑색", "black"], reference: [25, 28, 32] },
  { name: "투명", aliases: ["무색", "clear"], reference: [240, 240, 240] },
];

const MFDS_COLOR_MAP = new Map();
MFDS_COLORS.forEach((entry) => {
  MFDS_COLOR_MAP.set(entry.name, entry.name);
  entry.aliases?.forEach((alias) => MFDS_COLOR_MAP.set(alias, entry.name));
});

export function normalizeColorName(name) {
  if (!name) return "";
  const trimmed = name.trim().toLowerCase();
  for (const [alias, canonical] of MFDS_COLOR_MAP.entries()) {
    if (trimmed === alias.toLowerCase()) {
      return canonical;
    }
  }
  return name.trim();
}

export function analyzeDominantColors(imageData) {
  const { data, width, height } = imageData;
  if (!width || !height) {
    return { primary: null, secondary: null, palette: [], stats: { considered: 0, saturationMean: 0 } };
  }

  const counts = new Array(MFDS_COLORS.length).fill(0);
  let considered = 0;
  let saturationSum = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 220));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 25) continue;
      const { h, s, l } = rgbToHsl(r, g, b);
      if (l > 0.93 && s < 0.06) {
        continue; // very bright white background
      }
      considered++;
      saturationSum += s;
      const lab = rgbToLab(r, g, b);
      let bestIndex = 0;
      let bestDistance = Infinity;
      MFDS_COLORS.forEach((entry, index) => {
        const refLab = toLab(entry.reference);
        const distance = deltaE(lab, refLab);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      counts[bestIndex] += 1;
    }
  }

  const palette = MFDS_COLORS.map((entry, index) => ({
    name: entry.name,
    ratio: considered ? counts[index] / considered : 0,
  }))
    .filter((item) => item.ratio > 0.02)
    .sort((a, b) => b.ratio - a.ratio);

  const primary = palette[0] ?? null;
  const secondary = palette[1] && palette[1].ratio > 0.1 ? palette[1] : null;
  const stats = {
    considered,
    saturationMean: considered ? saturationSum / considered : 0,
  };

  return { primary, secondary, palette, stats };
}

export function colorMatchScore(targetName, candidateNames = []) {
  if (!targetName) return 0.3;
  const canonical = normalizeColorName(targetName);
  if (!canonical) return 0.3;
  const normalizedCandidates = candidateNames.map((name) => normalizeColorName(name)).filter(Boolean);
  if (!normalizedCandidates.length) return 0.4;
  if (normalizedCandidates.includes(canonical)) {
    return 1;
  }
  const targetEntry = MFDS_COLORS.find((entry) => entry.name === canonical);
  if (!targetEntry) return 0.5;
  const targetLab = toLab(targetEntry.reference);
  let bestScore = 0.4;
  for (const name of normalizedCandidates) {
    const entry = MFDS_COLORS.find((item) => item.name === name);
    if (!entry) continue;
    const distance = deltaE(targetLab, toLab(entry.reference));
    const score = 1 - clamp(distance / 80, 0, 1);
    if (score > bestScore) {
      bestScore = score;
    }
  }
  return bestScore;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function rgbToLab(r, g, b) {
  return toLab([r, g, b]);
}

function toLab([r, g, b]) {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function rgbToXyz(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  return [x, y, z];
}

function xyzToLab(x, y, z) {
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  let fx = pivot(x / refX);
  let fy = pivot(y / refY);
  let fz = pivot(z / refZ);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function pivot(value) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function deltaE(lab1, lab2) {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}
