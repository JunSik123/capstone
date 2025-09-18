let workerPromise = null;
let progressListener = null;

export async function recognizeImprint(canvas, { side = "front", onProgress } = {}) {
  try {
    const worker = await ensureWorker((message) => {
      if (onProgress) {
        onProgress({ ...message, side });
      }
    });
    const result = await worker.recognize(canvas, { rotateAuto: true });
    progressListener = null;
    const raw = (result?.data?.text ?? "").replace(/\s+/g, " ").trim();
    const normalized = normalizeImprint(raw);
    const confidenceRaw = (result?.data?.confidence ?? 0) / 100;
    return {
      raw,
      text: normalized,
      confidence: Number(confidenceRaw.toFixed(2)),
      symbols: result?.data?.symbols ?? [],
      words: result?.data?.words ?? [],
    };
  } catch (error) {
    console.warn("OCR 실패", error);
    return { raw: "", text: "", confidence: 0, error };
  }
}

export async function terminateOcr() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch (error) {
    console.warn("OCR 종료 실패", error);
  } finally {
    workerPromise = null;
  }
}

async function ensureWorker(logger) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js");
      const worker = await createWorker({
        logger: (message) => progressListener?.(message),
      });
      await worker.load();
      await worker.loadLanguage("eng+kor");
      await worker.initialize("eng+kor");
      return worker;
    })();
  }
  progressListener = logger ?? null;
  return workerPromise;
}

export function normalizeImprint(text) {
  if (!text) return "";
  const normalized = text
    .replace(/[^0-9a-zA-Z가-힣+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.toUpperCase();
}
