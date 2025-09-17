const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function extractForegroundCanvas(sourceCanvas, { margin = 18, sampleStep = 2 } = {}) {
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("전처리용 캔버스를 초기화하지 못했습니다.");
  }
  const { width, height } = sourceCanvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  const step = Math.max(1, sampleStep);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 30) continue;
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      const distanceFromWhite = 255 - brightness;
      if (distanceFromWhite > 12 || saturation > 0.12) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    return {
      canvas: sourceCanvas,
      bbox: { x: 0, y: 0, width, height },
      coverage: 1,
    };
  }

  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(width, maxX + margin);
  maxY = Math.min(height, maxY + margin);

  const cropWidth = Math.max(1, maxX - minX);
  const cropHeight = Math.max(1, maxY - minY);
  const dest = document.createElement("canvas");
  dest.width = cropWidth;
  dest.height = cropHeight;
  const destCtx = dest.getContext("2d");
  destCtx.putImageData(ctx.getImageData(minX, minY, cropWidth, cropHeight), 0, 0);

  return {
    canvas: dest,
    bbox: { x: minX, y: minY, width: cropWidth, height: cropHeight },
    coverage: (cropWidth * cropHeight) / (width * height),
  };
}

export function computeSharpness(imageData) {
  const { data, width, height } = imageData;
  if (!width || !height) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      let gx = 0;
      let gy = 0;
      let kernelIndex = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          gx += gxKernel[kernelIndex] * gray;
          gy += gyKernel[kernelIndex] * gray;
          kernelIndex++;
        }
      }
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      sum += magnitude;
      sumSq += magnitude * magnitude;
      count++;
    }
  }

  if (!count) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return clamp(variance / 8000, 0, 1);
}

export function computeBrightness(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  if (!totalPixels) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const avg = sum / totalPixels;
  return clamp(avg / 255, 0, 1);
}

export function detectScoreline(imageData) {
  const { data, width, height } = imageData;
  if (!width || !height) {
    return { type: "", confidence: 0 };
  }
  const rowCenter = Math.floor(height / 2);
  const colCenter = Math.floor(width / 2);
  const sampleRange = Math.max(2, Math.floor(height * 0.05));

  const analyzeLine = (horizontal = true) => {
    let darkCounts = 0;
    let total = 0;
    const length = horizontal ? width : height;
    const step = Math.max(1, Math.floor(length / 320));
    const baseIndex = horizontal ? rowCenter : colCenter;
    for (let offset = -sampleRange; offset <= sampleRange; offset += Math.max(1, sampleRange / 4)) {
      for (let pos = 0; pos < length; pos += step) {
        const x = horizontal ? pos : baseIndex + offset;
        const y = horizontal ? baseIndex + offset : pos;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const idx = (y * width + x) * 4;
        const brightness = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (brightness < 110) {
          darkCounts++;
        }
        total++;
      }
    }
    if (!total) return 0;
    return darkCounts / total;
  };

  const horizontalRatio = analyzeLine(true);
  const verticalRatio = analyzeLine(false);
  const confidence = Math.max(horizontalRatio, verticalRatio);

  if (horizontalRatio > 0.34 && verticalRatio > 0.3) {
    return { type: "+", confidence: clamp(confidence * 1.4, 0, 1) };
  }
  if (horizontalRatio > 0.34) {
    return { type: "-", confidence: clamp(horizontalRatio * 1.4, 0, 1) };
  }
  return { type: "없음", confidence: clamp(1 - horizontalRatio * 1.2, 0, 1) };
}

export function estimateShapeFromBBox(bbox, coverage) {
  if (!bbox) return { shape: "", confidence: 0 };
  const aspect = bbox.width > bbox.height ? bbox.width / bbox.height : bbox.height / bbox.width;
  const coverageClamped = clamp(coverage, 0, 1);
  if (aspect < 1.12) {
    return { shape: "원형", confidence: clamp(0.65 + (1 - Math.abs(1 - aspect)) * 0.35, 0, 1) };
  }
  if (aspect < 1.6) {
    return { shape: "타원형", confidence: clamp(0.6 + (aspect - 1.12) * 0.4, 0, 1) };
  }
  if (aspect < 2.3) {
    return { shape: "장방형", confidence: clamp(0.55 + (aspect - 1.6) * 0.3, 0, 1) };
  }
  const capsuleConfidence = clamp(0.5 + coverageClamped * 0.4, 0, 1);
  return { shape: "캡슐형", confidence: capsuleConfidence };
}

export function downscaleCanvas(canvas, target = 480) {
  const maxSide = Math.max(canvas.width, canvas.height);
  if (maxSide <= target) return canvas;
  const scale = target / maxSide;
  const dest = document.createElement("canvas");
  dest.width = Math.round(canvas.width * scale);
  dest.height = Math.round(canvas.height * scale);
  const ctx = dest.getContext("2d");
  ctx.drawImage(canvas, 0, 0, dest.width, dest.height);
  return dest;
}
