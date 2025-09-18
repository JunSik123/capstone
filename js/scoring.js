import { colorMatchScore } from "./color.js";
import { normalizeImprint } from "./ocr.js";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const SHAPE_ALIASES = new Map([
  ["원형", ["원형", "원", "round", "circle"]],
  ["타원형", ["타원", "타원형", "oval", "elliptical"]],
  ["장방형", ["장방형", "장방", "직사각형", "rectangle"]],
  ["캡슐형", ["캡슐", "캡슐형", "capsule"]],
  ["기타", ["삼각형", "오각형", "기타"]],
]);

export function normalizeShapeName(name) {
  if (!name) return "";
  const trimmed = name.trim().toLowerCase();
  for (const [canonical, aliases] of SHAPE_ALIASES.entries()) {
    if (aliases.some((alias) => trimmed.includes(alias))) {
      return canonical;
    }
  }
  return name.trim();
}

export function deriveScorelineType(item) {
  const tokens = `${item.lineFront ?? ""} ${item.lineBack ?? ""}`.replace(/\s+/g, " ").trim();
  if (!tokens) return "";
  if (/[+＋]/.test(tokens) && /[-―－–]/.test(tokens)) {
    return "+";
  }
  if (/[+＋]/.test(tokens)) return "+";
  if (/(없음|무|무지|무분)/.test(tokens)) return "없음";
  if (tokens && /[-―－–]/.test(tokens)) return "-";
  return "기타";
}

export function rerankCandidates(items, features) {
  const imprintFrontQuery = normalizeImprint(features?.imprint?.front?.text ?? "");
  const imprintBackQuery = normalizeImprint(features?.imprint?.back?.text ?? "");
  const frontConfidence = features?.imprint?.front?.confidence ?? 0.6;
  const backConfidence = features?.imprint?.back?.confidence ?? 0.4;
  const primaryColor = features?.colors?.primary?.name ?? "";
  const secondaryColor = features?.colors?.secondary?.name ?? "";
  const shape = features?.shape?.name ?? "";
  const scoreline = features?.scoreline?.type ?? "";
  const qualityFactor = features?.quality?.overall ?? 0.5;

  return items
    .map((item) => {
      const normalizedFront = normalizeImprint(item.printFront);
      const normalizedBack = normalizeImprint(item.printBack);
      const frontScore = imprintSimilarity(imprintFrontQuery, normalizedFront) * clamp(frontConfidence, 0.2, 1);
      const backScore = imprintSimilarity(imprintBackQuery, normalizedBack) * clamp(backConfidence, 0.2, 1);
      const colorScore = colorMatchScore(primaryColor, [item.colorClass1, item.colorClass2]) * 0.7 +
        colorMatchScore(secondaryColor, [item.colorClass1, item.colorClass2]) * 0.3;
      const shapeScore = shapeMatchScore(shape, item.drugShape);
      const scorelineScore = scorelineMatchScore(scoreline, deriveScorelineType(item));
      const sizeScore = sizeMatchScore(features?.sizeEstimate, item);

      const weighted =
        frontScore * 0.42 +
        backScore * 0.24 +
        colorScore * 0.15 +
        shapeScore * 0.08 +
        scorelineScore * 0.06 +
        sizeScore * 0.05;

      const finalScore = clamp(weighted * (0.6 + qualityFactor * 0.8), 0, 1.2);
      const calibrated = clamp(finalScore * 0.95 + qualityFactor * 0.05, 0, 1);

      return {
        ...item,
        scores: {
          imprintFront: frontScore,
          imprintBack: backScore,
          color: colorScore,
          shape: shapeScore,
          scoreline: scorelineScore,
          size: sizeScore,
          quality: qualityFactor,
        },
        weighted,
        finalScore,
        confidence: calibrated,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function imprintSimilarity(query, target) {
  if (!query && !target) return 0.4;
  if (!query) return 0.35;
  if (!target) return 0.3;
  const normalizedQuery = query.replace(/\s+/g, "").trim();
  const normalizedTarget = target.replace(/\s+/g, "").trim();
  if (!normalizedQuery && !normalizedTarget) return 0.4;
  if (normalizedQuery === normalizedTarget) return 1;
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) {
    return clamp(Math.min(normalizedQuery.length, normalizedTarget.length) / Math.max(normalizedQuery.length, normalizedTarget.length), 0, 1);
  }
  const distance = levenshtein(normalizedQuery, normalizedTarget);
  const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
  if (!maxLen) return 0.4;
  return clamp(1 - distance / maxLen, 0, 1);
}

function shapeMatchScore(predicted, candidate) {
  if (!predicted) return 0.4;
  const normalized = normalizeShapeName(candidate);
  if (!normalized) return 0.4;
  if (normalized === predicted) return 1;
  if (predicted === "캡슐형" && normalized.includes("장방")) return 0.75;
  if (predicted === "타원형" && normalized.includes("원")) return 0.7;
  return 0.45;
}

function scorelineMatchScore(predicted, candidate) {
  if (!predicted) return 0.5;
  if (!candidate) return predicted === "없음" ? 0.7 : 0.4;
  if (candidate === predicted) return 1;
  if (predicted === "없음" && candidate === "") return 0.8;
  return 0.45;
}

function sizeMatchScore(estimate, item) {
  if (!estimate) return 0.5;
  const candidateSize = parseFloat(item.lengLong || item.lengShort || item.thick || "0");
  if (!candidateSize) return 0.5;
  const diff = Math.abs(candidateSize - estimate.meanMm);
  const tolerance = estimate.toleranceMm ?? 1.8;
  const score = clamp(1 - diff / (tolerance * 2), 0, 1);
  return score;
}

export function levenshtein(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  const matrix = Array.from({ length: lenA + 1 }, (_, i) => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[lenA][lenB];
}
