import { CameraController } from "./camera.js";
import {
  extractForegroundCanvas,
  computeSharpness,
  computeBrightness,
  detectScoreline,
  estimateShapeFromBBox,
  downscaleCanvas,
} from "./image.js";
import { analyzeDominantColors, MFDS_COLORS } from "./color.js";
import { recognizeImprint, normalizeImprint } from "./ocr.js";
import {
  MFDSClient,
  DEFAULT_BASE_URL,
  REMOTE_BASE_URL,
  DEFAULT_SERVICE_KEY_ENCODED,
  DEFAULT_SERVICE_KEY_DECODED,
} from "./mfds-api.js";
import { PillPipeline, createDefaultSteps } from "./pipeline.js";
import { rerankCandidates } from "./scoring.js";
import { PillDatabase } from "./database.js";

const SERVICE_KEY_STORAGE = "mfds-service-key";
const RESPONSE_TYPE_STORAGE = "mfds-response-type";
const DB_METADATA_STORAGE = "mfds-db-metadata";
const MAX_UPLOAD_DIMENSION = 2048;

const dom = {
  apiForm: document.getElementById("api-form"),
  serviceKeyInput: document.getElementById("service-key-input"),
  responseFormat: document.getElementById("response-format"),
  keyStatus: document.getElementById("key-status"),
  clearKey: document.getElementById("clear-key"),
  endpointDisplay: document.getElementById("endpoint-display"),
  defaultKeyEncoded: document.getElementById("default-key-encoded"),
  defaultKeyDecoded: document.getElementById("default-key-decoded"),
  dbStatusText: document.getElementById("db-status-text"),
  dbMetaText: document.getElementById("db-meta-text"),
  dbSyncButton: document.getElementById("sync-database"),
  dbProgress: document.getElementById("db-progress"),
  video: document.getElementById("live-video"),
  overlay: document.getElementById("live-overlay"),
  cameraStatus: document.getElementById("camera-status"),
  startCamera: document.getElementById("start-camera"),
  stopCamera: document.getElementById("stop-camera"),
  captureFront: document.getElementById("capture-front"),
  captureBack: document.getElementById("capture-back"),
  resetCaptures: document.getElementById("reset-captures"),
  uploadFrontInput: document.getElementById("upload-front-input"),
  uploadBackInput: document.getElementById("upload-back-input"),
  uploadFrontButton: document.getElementById("upload-front"),
  uploadBackButton: document.getElementById("upload-back"),
  frontPreview: document.getElementById("front-preview"),
  backPreview: document.getElementById("back-preview"),
  frontQuality: document.getElementById("front-quality"),
  backQuality: document.getElementById("back-quality"),
  runAnalysis: document.getElementById("run-analysis"),
  analysisStatus: document.getElementById("analysis-status"),
  pipelineSteps: document.getElementById("pipeline-steps"),
  featureForm: document.getElementById("feature-form"),
  imprintFrontInput: document.getElementById("imprint-front"),
  imprintBackInput: document.getElementById("imprint-back"),
  colorPrimarySelect: document.getElementById("color-primary"),
  colorSecondarySelect: document.getElementById("color-secondary"),
  shapeSelect: document.getElementById("shape"),
  scorelineSelect: document.getElementById("scoreline"),
  featureStatus: document.getElementById("feature-status"),
  featureSubmit: document.querySelector("#feature-form button[type='submit']"),
  resultsContainer: document.getElementById("results-container"),
  telemetryGrid: document.getElementById("telemetry-grid"),
  debugLog: document.getElementById("debug-log"),
  toggleHelp: document.getElementById("toggle-help"),
  helpDialog: document.getElementById("help-dialog"),
  closeHelp: document.getElementById("close-help"),
};

const state = {
  serviceKey: "",
  responseType: "json",
  captures: {
    front: null,
    back: null,
  },
  processed: null,
  pipeline: null,
  features: null,
  ranked: [],
  telemetry: [],
  database: {
    ready: false,
    syncing: false,
    count: 0,
    lastUpdated: null,
  },
};

const camera = new CameraController(dom.video, dom.overlay);
const mfdsClient = new MFDSClient({ baseUrl: DEFAULT_BASE_URL });
const pillDatabase = new PillDatabase();
let pipelineInstance = null;
let pipelineStepsMeta = [];

init();

function init() {
  initializeStaticInfo();
  loadStoredPreferences();
  setupForms();
  setupDatabaseControls();
  setupCameraControls();
  setupUploadControls();
  setupFeatureForm();
  setupHelpDialog();
  renderColorOptions();
  renderShapeOptions();
  resetPreviews();
  if (dom.featureSubmit) {
    dom.featureSubmit.disabled = true;
  }
}

function loadStoredPreferences() {
  try {
    const storedKey = localStorage.getItem(SERVICE_KEY_STORAGE);
    const initialKey = storedKey || DEFAULT_SERVICE_KEY_ENCODED || "";
    if (initialKey) {
      dom.serviceKeyInput.value = initialKey;
      state.serviceKey = initialKey;
      mfdsClient.setServiceKey(initialKey);
      dom.keyStatus.textContent = storedKey ? "저장된 키를 불러왔습니다." : "기본 키가 설정되었습니다.";
    }
    const storedType = localStorage.getItem(RESPONSE_TYPE_STORAGE) ?? "json";
    dom.responseFormat.value = storedType;
    state.responseType = storedType;
    mfdsClient.setResponseType(storedType);

    const storedMeta = localStorage.getItem(DB_METADATA_STORAGE);
    if (storedMeta) {
      try {
        const parsed = JSON.parse(storedMeta);
        state.database.count = Number(parsed.count ?? 0);
        state.database.lastUpdated = parsed.updatedAt ?? null;
        state.database.ready = Boolean(state.database.count);
        updateDatabaseStatus(parsed);
      } catch (metaError) {
        appendLog("DB 메타데이터 파싱 실패", metaError);
        updateDatabaseStatus();
      }
    } else {
      updateDatabaseStatus();
    }
  } catch (error) {
    appendLog("스토리지 접근 실패", error);
  }
}

function setupForms() {
  dom.apiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(dom.apiForm);
    const key = (formData.get("serviceKey") ?? "").toString().trim();
    const type = (formData.get("type") ?? "json").toString();
    if (!key) {
      dom.keyStatus.textContent = "서비스 키를 입력해주세요.";
      return;
    }
    state.serviceKey = key;
    state.responseType = type;
    mfdsClient.setServiceKey(key);
    mfdsClient.setResponseType(type);
    try {
      localStorage.setItem(SERVICE_KEY_STORAGE, key);
      localStorage.setItem(RESPONSE_TYPE_STORAGE, type);
      dom.keyStatus.textContent = "서비스 키가 저장되었습니다.";
    } catch (error) {
      appendLog("서비스 키 저장 실패", error);
      dom.keyStatus.textContent = "스토리지 저장에 실패했습니다.";
    }
    ensureDatabaseReady({ force: true });
  });

  dom.clearKey.addEventListener("click", () => {
    state.serviceKey = "";
    mfdsClient.setServiceKey("");
    dom.serviceKeyInput.value = "";
    dom.keyStatus.textContent = "서비스 키를 삭제했습니다.";
    try {
      localStorage.removeItem(SERVICE_KEY_STORAGE);
      localStorage.removeItem(DB_METADATA_STORAGE);
    } catch (error) {
      appendLog("서비스 키 삭제 실패", error);
    }
    state.database.ready = false;
    state.database.count = 0;
    state.database.lastUpdated = null;
    updateDatabaseStatus();
  });
}

function setupCameraControls() {
  dom.startCamera.addEventListener("click", async () => {
    try {
      dom.cameraStatus.textContent = "카메라 초기화 중...";
      await camera.start();
      dom.cameraStatus.textContent = "촬영 준비 완료";
      dom.startCamera.disabled = true;
      dom.stopCamera.disabled = false;
      dom.captureFront.disabled = false;
      dom.captureBack.disabled = false;
      dom.resetCaptures.disabled = false;
    } catch (error) {
      appendLog("카메라 시작 실패", error);
      dom.cameraStatus.textContent = `카메라 오류: ${error.message}`;
    }
  });

  dom.stopCamera.addEventListener("click", () => {
    camera.stop();
    dom.cameraStatus.textContent = "카메라 대기 중";
    dom.startCamera.disabled = false;
    dom.stopCamera.disabled = true;
  });

  dom.captureFront.addEventListener("click", () => captureFrame("front"));
  dom.captureBack.addEventListener("click", () => captureFrame("back"));
  dom.resetCaptures.addEventListener("click", () => {
    state.captures.front = null;
    state.captures.back = null;
    resetPreviews();
    dom.runAnalysis.disabled = true;
    dom.featureSubmit.disabled = true;
    dom.analysisStatus.textContent = "";
    dom.resultsContainer.innerHTML = "";
    dom.telemetryGrid.innerHTML = "";
    if (dom.uploadFrontInput) dom.uploadFrontInput.value = "";
    if (dom.uploadBackInput) dom.uploadBackInput.value = "";
    appendLog("캡처가 초기화되었습니다.");
  });

  dom.runAnalysis.addEventListener("click", () => runPipeline());
}

function setupUploadControls() {
  dom.uploadFrontButton?.addEventListener("click", () => dom.uploadFrontInput?.click());
  dom.uploadBackButton?.addEventListener("click", () => dom.uploadBackInput?.click());

  dom.uploadFrontInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await processUploadedImage("front", file);
    }
    event.target.value = "";
  });

  dom.uploadBackInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await processUploadedImage("back", file);
    }
    event.target.value = "";
  });
}

function setupFeatureForm() {
  dom.featureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.features) return;
    if (!state.database.ready) {
      dom.featureStatus.textContent = "로컬 데이터베이스가 아직 준비되지 않았습니다.";
      return;
    }
    dom.featureStatus.textContent = "재검색 중...";
    const updatedFeatures = {
      ...state.features,
      imprint: {
        front: {
          ...state.features.imprint.front,
          text: normalizeImprint(dom.imprintFrontInput.value),
        },
        back: {
          ...state.features.imprint.back,
          text: normalizeImprint(dom.imprintBackInput.value),
        },
      },
      colors: {
        primary: dom.colorPrimarySelect.value
          ? { name: dom.colorPrimarySelect.value, ratio: 1 }
          : state.features.colors.primary,
        secondary: dom.colorSecondarySelect.value
          ? { name: dom.colorSecondarySelect.value, ratio: 1 }
          : state.features.colors.secondary,
      },
      shape: dom.shapeSelect.value
        ? { name: dom.shapeSelect.value, confidence: 1 }
        : state.features.shape,
      scoreline: dom.scorelineSelect.value
        ? { type: dom.scorelineSelect.value, confidence: 1 }
        : state.features.scoreline,
    };
    state.features = updatedFeatures;
    try {
      const { items } = await searchLocalDatabase(updatedFeatures);
      state.ranked = rerankCandidates(items, updatedFeatures).slice(0, 10);
      renderResults(state.ranked);
      dom.featureStatus.textContent = `${state.ranked.length}건 재랭킹 완료`;
      appendLog("수동 재검색 완료", { count: state.ranked.length });
    } catch (error) {
      dom.featureStatus.textContent = `재검색 실패: ${error.message}`;
      appendLog("재검색 실패", error);
    }
  });
}

function setupHelpDialog() {
  if (!dom.helpDialog) return;
  dom.toggleHelp?.addEventListener("click", () => {
    dom.helpDialog.showModal?.();
  });
  dom.closeHelp?.addEventListener("click", () => {
    dom.helpDialog.close?.();
  });
}

function initializeStaticInfo() {
  if (dom.endpointDisplay) {
    const lines = [REMOTE_BASE_URL];
    if (DEFAULT_BASE_URL !== REMOTE_BASE_URL) {
      lines.push(`(로컬 프록시: ${DEFAULT_BASE_URL})`);
    }
    dom.endpointDisplay.textContent = lines.join("\n");
  }
  if (dom.defaultKeyEncoded) {
    dom.defaultKeyEncoded.textContent = DEFAULT_SERVICE_KEY_ENCODED || "이미지 참고";
  }
  if (dom.defaultKeyDecoded) {
    dom.defaultKeyDecoded.textContent = DEFAULT_SERVICE_KEY_DECODED || "이미지 참고";
  }
}

function setupDatabaseControls() {
  dom.dbSyncButton?.addEventListener("click", () => {
    ensureDatabaseReady({ force: true, interactive: true });
  });
  if (state.serviceKey) {
    ensureDatabaseReady({ force: false, interactive: false });
  }
}

async function ensureDatabaseReady({ force = false, interactive = false } = {}) {
  if (state.database.syncing) {
    updateDatabaseStatus();
    return;
  }
  try {
    const hasAny = await pillDatabase.hasAny();
    if (hasAny && !force) {
      if (!state.database.ready) {
        state.database.ready = true;
        if (!state.database.count) {
          state.database.count = await pillDatabase.count();
        }
        updateDatabaseStatus();
      }
      return;
    }
    if (!state.serviceKey) {
      if (interactive) {
        dom.keyStatus.textContent = "서비스 키를 먼저 저장해주세요.";
      }
      updateDatabaseStatus();
      return;
    }
    await syncDatabase({ interactive });
  } catch (error) {
    appendLog("데이터베이스 확인 실패", error);
  }
}

async function syncDatabase({ interactive = false } = {}) {
  if (state.database.syncing) return;
  state.database.syncing = true;
  state.database.ready = false;
  updateDatabaseStatus();
  setDatabaseProgress(0, 1, { visible: true, indeterminate: true });

  const originalType = state.responseType;

  try {
    mfdsClient.setServiceKey(state.serviceKey);
    mfdsClient.setResponseType("json");

    await pillDatabase.clear();
    let lastFetched = 0;
    let totalCount = null;

    await mfdsClient.fetchAll(
      {},
      {
        pageSize: 120,
        collect: false,
        onPage: async ({ items, fetched, totalCount: apiTotal }) => {
          if (items.length) {
            await pillDatabase.bulkPut(items);
          }
          lastFetched = fetched;
          if (apiTotal !== undefined && apiTotal !== null) {
            totalCount = Number(apiTotal);
          }
          state.database.count = lastFetched;
          updateDatabaseStatus({ count: lastFetched, totalCount });
          setDatabaseProgress(lastFetched, totalCount ?? undefined);
        },
      }
    );

    state.database.ready = lastFetched > 0;
    state.database.lastUpdated = new Date().toISOString();
    state.database.count = lastFetched;
    saveDatabaseMetadata({
      count: lastFetched,
      updatedAt: state.database.lastUpdated,
      baseUrl: mfdsClient.baseUrl,
    });
    updateDatabaseStatus({ count: lastFetched, updatedAt: state.database.lastUpdated });
  } catch (error) {
    appendLog("데이터베이스 동기화 실패", error);
    if (interactive) {
      const hint =
        typeof error?.message === "string" && error.message.includes("Failed to fetch")
          ? " (브라우저에서 직접 MFDS API에 접근할 수 없습니다. npm start로 실행된 개발 서버 또는 동등한 프록시를 사용하세요.)"
          : "";
      dom.analysisStatus.textContent = `데이터베이스 동기화 실패: ${error.message}${hint}`;
    }
  } finally {
    state.database.syncing = false;
    mfdsClient.setResponseType(originalType);
    updateDatabaseStatus();
    setDatabaseProgress(0, 1, { visible: false });
  }
}

function updateDatabaseStatus(meta = {}) {
  if (dom.dbStatusText) {
    if (state.database.syncing) {
      const progress = meta.count ?? state.database.count ?? 0;
      const total = meta.totalCount ?? null;
      dom.dbStatusText.textContent = total
        ? `동기화 중 (${progress.toLocaleString()} / ${total.toLocaleString()})`
        : `${progress.toLocaleString()}건 처리 중...`;
    } else if (state.database.ready) {
      dom.dbStatusText.textContent = "동기화 완료";
    } else {
      dom.dbStatusText.textContent = "동기화 필요";
    }
  }
  if (dom.dbMetaText) {
    if (state.database.ready) {
      const countText = (meta.count ?? state.database.count ?? 0).toLocaleString();
      const updatedAt = meta.updatedAt ?? state.database.lastUpdated;
      dom.dbMetaText.textContent = `${countText}건 · ${updatedAt ? formatDateTime(updatedAt) : "업데이트 시각 없음"}`;
    } else if (state.database.syncing) {
      dom.dbMetaText.textContent = "API에서 참조 데이터를 내려받는 중";
    } else {
      dom.dbMetaText.textContent = "버튼을 눌러 로컬 DB를 준비하세요.";
    }
  }
}

function setDatabaseProgress(value, total, { visible = true, indeterminate = false } = {}) {
  if (!dom.dbProgress) return;
  if (!visible) {
    dom.dbProgress.hidden = true;
    dom.dbProgress.removeAttribute("value");
    return;
  }
  dom.dbProgress.hidden = false;
  if (indeterminate || !total) {
    dom.dbProgress.removeAttribute("value");
    dom.dbProgress.removeAttribute("max");
  } else {
    dom.dbProgress.max = total;
    dom.dbProgress.value = value;
  }
}

function saveDatabaseMetadata(meta) {
  try {
    localStorage.setItem(DB_METADATA_STORAGE, JSON.stringify(meta));
  } catch (error) {
    appendLog("DB 메타데이터 저장 실패", error);
  }
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ` +
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function searchLocalDatabase(features) {
  const started = performance.now();
  const items = await pillDatabase.searchByFeatures(features, { limit: 400 });
  const duration = performance.now() - started;
  return { items, duration };
}

async function captureFrame(side) {
  try {
    const captured = await camera.capture();
    state.captures[side] = captured;
    const quality = evaluateCaptureQuality(captured.imageData);
    const previewElement = side === "front" ? dom.frontPreview : dom.backPreview;
    const qualityElement = side === "front" ? dom.frontQuality : dom.backQuality;
    previewElement.src = captured.dataUrl;
    previewElement.hidden = false;
    qualityElement.textContent = `품질 ${Math.round(quality.score * 100)}% · 선명도 ${Math.round(quality.sharpness * 100)}%`;
    qualityElement.dataset.score = quality.score;
    appendLog(`${side} 캡처 완료`, quality);
    updateAnalysisAvailability();
  } catch (error) {
    appendLog(`${side} 캡처 실패`, error);
    dom.analysisStatus.textContent = `${side === "front" ? "앞" : "뒤"}면 캡처에 실패했습니다.`;
  }
}

async function processUploadedImage(side, file) {
  const sideLabel = side === "front" ? "앞" : "뒤";
  try {
    dom.analysisStatus.textContent = `${sideLabel}면 이미지 불러오는 중...`;
    const capture = await createCaptureFromFile(file);
    state.captures[side] = capture;
    const quality = evaluateCaptureQuality(capture.imageData);
    const previewElement = side === "front" ? dom.frontPreview : dom.backPreview;
    const qualityElement = side === "front" ? dom.frontQuality : dom.backQuality;
    previewElement.src = capture.dataUrl;
    previewElement.hidden = false;
    qualityElement.textContent = `품질 ${Math.round(quality.score * 100)}% · 선명도 ${Math.round(quality.sharpness * 100)}%`;
    qualityElement.dataset.score = quality.score;
    dom.resetCaptures.disabled = false;
    updateAnalysisAvailability();
    dom.analysisStatus.textContent = `${sideLabel}면 이미지가 준비되었습니다.`;
    appendLog(`${side} 업로드 완료`, {
      file: { name: file.name, size: file.size, type: file.type },
      quality,
    });
  } catch (error) {
    appendLog(`${side} 업로드 실패`, error);
    dom.analysisStatus.textContent = `${sideLabel}면 이미지 처리 실패: ${error.message}`;
  }
}

function updateAnalysisAvailability() {
  const ready = Boolean(state.captures.front && state.captures.back);
  dom.runAnalysis.disabled = !ready;
}

function resetPreviews() {
  dom.frontPreview.src = "";
  dom.frontPreview.hidden = true;
  dom.frontQuality.textContent = "";
  dom.backPreview.src = "";
  dom.backPreview.hidden = true;
  dom.backQuality.textContent = "";
}

async function runPipeline() {
  if (!state.captures.front || !state.captures.back) {
    dom.analysisStatus.textContent = "앞/뒷면을 모두 촬영해주세요.";
    return;
  }
  if (!state.database.ready) {
    if (!state.serviceKey) {
      dom.analysisStatus.textContent = "서비스 키를 저장하고 로컬 데이터베이스를 동기화해주세요.";
    } else if (state.database.syncing) {
      dom.analysisStatus.textContent = "로컬 데이터베이스 동기화가 완료될 때까지 기다려주세요.";
    } else {
      dom.analysisStatus.textContent = "로컬 데이터베이스를 먼저 동기화해주세요.";
      ensureDatabaseReady({ interactive: true });
    }
    return;
  }

  dom.runAnalysis.disabled = true;
  dom.analysisStatus.textContent = "파이프라인 실행 중...";
  renderPipelineSkeleton();
  appendLog("파이프라인 시작");

  const context = {
    captures: state.captures,
    processed: {},
    metrics: {},
    features: null,
    serviceKey: state.serviceKey,
    database: {
      count: state.database.count,
      lastUpdated: state.database.lastUpdated,
    },
  };

  if (state.serviceKey) {
    mfdsClient.setServiceKey(state.serviceKey);
    mfdsClient.setResponseType(state.responseType);
  }

  pipelineStepsMeta = createDefaultSteps({
    preprocess: async ({ context }) => {
      const processed = {};
      for (const side of ["front", "back"]) {
        const capture = context.captures[side];
        if (!capture) continue;
        const cropped = extractForegroundCanvas(capture.canvas);
        const normalizedCanvas = downscaleCanvas(cropped.canvas, 640);
        const ctx = normalizedCanvas.getContext("2d", { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, normalizedCanvas.width, normalizedCanvas.height);
        processed[side] = {
          canvas: normalizedCanvas,
          imageData,
          bbox: cropped.bbox,
          coverage: cropped.coverage,
          original: capture,
        };
      }
      context.processed = processed;
      return processed;
    },
    estimateQuality: ({ context }) => {
      const quality = {};
      for (const side of ["front", "back"]) {
        const processed = context.processed[side];
        if (!processed) continue;
        const sharpness = computeSharpness(processed.imageData);
        const brightness = computeBrightness(processed.imageData);
        quality[side] = {
          sharpness,
          brightness,
          scoreline: detectScoreline(processed.imageData),
          shape: estimateShapeFromBBox(processed.bbox, processed.coverage),
        };
      }
      const colors = analyzeDominantColors(context.processed.front?.imageData ?? context.processed.back?.imageData);
      const overallQuality = clampAverage([
        quality.front?.sharpness ?? 0,
        quality.back?.sharpness ?? 0,
        balanceExposure(quality.front?.brightness),
        balanceExposure(quality.back?.brightness),
      ]);
      const metrics = {
        ...quality,
        colors,
        overallQuality,
      };
      context.metrics = metrics;
      return metrics;
    },
    runOcr: async ({ context }) => {
      const results = {};
      for (const side of ["front", "back"]) {
        const processed = context.processed[side];
        if (!processed) continue;
        results[side] = await recognizeImprint(processed.canvas, {
          side,
          onProgress: (message) => updatePipelineProgress("ocr", `${message.status} ${(message.progress ?? 0) * 100 | 0}%`),
        });
      }
      return results;
    },
    fuseFeatures: ({ context, results }) => {
      const ocr = results.ocr?.output ?? {};
      const metrics = context.metrics;
      const features = {
        imprint: {
          front: { text: ocr.front?.text ?? "", confidence: ocr.front?.confidence ?? 0 },
          back: { text: ocr.back?.text ?? "", confidence: ocr.back?.confidence ?? 0 },
        },
        colors: {
          primary: metrics.colors?.primary ?? null,
          secondary: metrics.colors?.secondary ?? null,
          palette: metrics.colors?.palette ?? [],
        },
        shape: metrics.front?.shape?.shape ? metrics.front.shape : metrics.back?.shape ?? { name: "", confidence: 0 },
        scoreline: metrics.front?.scoreline ?? metrics.back?.scoreline ?? { type: "", confidence: 0 },
        quality: {
          overall: metrics.overallQuality,
          front: metrics.front,
          back: metrics.back,
        },
        sizeEstimate: null,
      };
      context.features = features;
      return features;
    },
    queryDatabase: async ({ context }) => {
      const features = context.features;
      const response = await searchLocalDatabase(features);
      context.candidates = response.items;
      return response;
    },
    rerank: ({ context, results }) => {
      const candidates = results.database?.output?.items ?? context.candidates ?? [];
      const ranked = rerankCandidates(candidates, context.features).slice(0, 10);
      context.ranked = ranked;
      return ranked;
    },
  });

  pipelineInstance = new PillPipeline(pipelineStepsMeta, {
    onStepStart(step) {
      updatePipelineStep(step.id, "active", "실행 중...");
    },
    onStepComplete(step, output, duration) {
      updatePipelineStep(step.id, "done", `완료 (${Math.round(duration)}ms)`);
      if (step.id === "features") {
        updateFeatureInputs(context.features ?? {});
      }
      if (step.id === "rerank") {
        renderResults(context.ranked ?? []);
      }
    },
    onStepError(step, error) {
      updatePipelineStep(step.id, "error", error.error?.message ?? error.message ?? "오류");
      dom.analysisStatus.textContent = `${step.title} 단계에서 오류가 발생했습니다.`;
      appendLog("파이프라인 오류", { step: step.id, error });
    },
  });

  try {
    const outputs = await pipelineInstance.run(context);
    state.processed = context.processed;
    state.features = context.features;
    state.ranked = context.ranked;
    state.telemetry = buildTelemetry(context, outputs);
    renderTelemetry(state.telemetry);
    updateFeatureInputs(context.features);
    dom.featureSubmit.disabled = false;
    dom.analysisStatus.textContent = `분석 완료: 후보 ${state.ranked.length}건`;
    appendLog("파이프라인 완료", {
      ocr: outputs.ocr?.output,
      results: state.ranked.length,
    });
  } catch (error) {
    dom.analysisStatus.textContent = error?.error?.message ?? error.message ?? "파이프라인 실패";
  } finally {
    dom.runAnalysis.disabled = false;
  }
}

function renderPipelineSkeleton() {
  dom.pipelineSteps.innerHTML = "";
  const steps = createDefaultSteps({});
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.dataset.stepId = step.id;
    item.dataset.stepIcon = step.icon;
    item.dataset.status = "pending";
    item.innerHTML = `
      <div class="step-title">${step.title}</div>
      <div class="step-desc">${step.description}</div>
      <div class="step-status">대기 중</div>
    `;
    dom.pipelineSteps.appendChild(item);
  });
}

function updatePipelineStep(stepId, status, message) {
  const element = dom.pipelineSteps.querySelector(`[data-step-id="${stepId}"]`);
  if (!element) return;
  element.dataset.status = status;
  const statusElement = element.querySelector(".step-status");
  if (statusElement && message) {
    statusElement.textContent = message;
  }
}

function updatePipelineProgress(stepId, message) {
  const element = dom.pipelineSteps.querySelector(`[data-step-id="${stepId}"]`);
  if (!element) return;
  const statusElement = element.querySelector(".step-status");
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function updateFeatureInputs(features = {}) {
  if (!features.imprint) return;
  dom.imprintFrontInput.value = features.imprint.front?.text ?? "";
  dom.imprintBackInput.value = features.imprint.back?.text ?? "";
  dom.colorPrimarySelect.value = features.colors.primary?.name ?? "";
  dom.colorSecondarySelect.value = features.colors.secondary?.name ?? "";
  dom.shapeSelect.value = features.shape?.name ?? "";
  dom.scorelineSelect.value = features.scoreline?.type ?? "";
}

function renderColorOptions() {
  const selects = [dom.colorPrimarySelect, dom.colorSecondarySelect];
  selects.forEach((select, index) => {
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = index === 0 ? "자동(검출)" : "없음";
    select.appendChild(placeholder);
    MFDS_COLORS.forEach((color) => {
      const option = document.createElement("option");
      option.value = color.name;
      option.textContent = color.name;
      select.appendChild(option);
    });
  });
}

function renderShapeOptions() {
  const shapes = ["", "원형", "타원형", "장방형", "캡슐형", "삼각형", "기타"];
  dom.shapeSelect.innerHTML = "";
  shapes.forEach((shape, index) => {
    const option = document.createElement("option");
    option.value = shape;
    option.textContent = index === 0 ? "자동" : shape;
    dom.shapeSelect.appendChild(option);
  });
}

function renderResults(candidates = []) {
  dom.resultsContainer.innerHTML = "";
  if (!candidates.length) {
    dom.resultsContainer.innerHTML = "<p>후보를 찾지 못했습니다. 각인 또는 색상을 조정해보세요.</p>";
    return;
  }

  candidates.forEach((candidate, index) => {
    const card = document.createElement("article");
    card.className = "candidate-card";
    card.innerHTML = `
      <header>
        <img src="${candidate.imageUrl || "https://dummyimage.com/120x120/e2e8f0/475569&text=Pill"}" alt="${candidate.itemName} 이미지" />
        <div>
          <h3>${index + 1}. ${candidate.itemName}</h3>
          <div class="badge">신뢰도 ${(candidate.confidence * 100).toFixed(1)}%</div>
          <p>${candidate.entpName || "제조사 정보 없음"}</p>
        </div>
      </header>
      <div class="progress"><span style="transform: scaleX(${clamp(candidate.finalScore, 0, 1)})"></span></div>
      <div class="breakdown">
        <span><strong>각인(앞)</strong><span>${(candidate.scores.imprintFront * 100).toFixed(0)}%</span></span>
        <span><strong>각인(뒤)</strong><span>${(candidate.scores.imprintBack * 100).toFixed(0)}%</span></span>
        <span><strong>색상</strong><span>${(candidate.scores.color * 100).toFixed(0)}%</span></span>
        <span><strong>형상</strong><span>${(candidate.scores.shape * 100).toFixed(0)}%</span></span>
        <span><strong>분할선</strong><span>${(candidate.scores.scoreline * 100).toFixed(0)}%</span></span>
      </div>
      <footer>
        <small>색상: ${candidate.colorClass1 || "-"} ${candidate.colorClass2 || ""} · 형상: ${candidate.drugShape || "-"} · 분할선: ${candidate.lineFront || candidate.lineBack || "-"}</small>
      </footer>
    `;
    dom.resultsContainer.appendChild(card);
  });
}

function buildTelemetry(context, outputs) {
  const telemetry = [];
  const quality = context.metrics;
  if (quality?.overallQuality !== undefined) {
    telemetry.push({
      label: "촬영 품질",
      value: `${Math.round((quality.overallQuality ?? 0) * 100)}%`,
      helper: `앞 ${Math.round((quality.front?.sharpness ?? 0) * 100)}% / 뒤 ${Math.round((quality.back?.sharpness ?? 0) * 100)}% 선명도`,
    });
  }
  const ocr = outputs.ocr?.output ?? {};
  if (ocr.front || ocr.back) {
    telemetry.push({
      label: "OCR 확신도",
      value: `${Math.round(((ocr.front?.confidence ?? 0) + (ocr.back?.confidence ?? 0)) / 2 * 100)}%`,
      helper: `앞 ${Math.round((ocr.front?.confidence ?? 0) * 100)}% / 뒤 ${Math.round((ocr.back?.confidence ?? 0) * 100)}%`,
    });
  }
  const searchDuration = outputs.database?.duration ?? 0;
  if (searchDuration) {
    telemetry.push({
      label: "로컬 검색 시간",
      value: `${Math.round(searchDuration)} ms`,
      helper: `저장된 후보 수: ${state.database.count.toLocaleString() ?? "-"}`,
    });
  }
  if (context.features?.colors?.palette?.length) {
    telemetry.push({
      label: "추정 색상",
      value: context.features.colors.primary?.name ?? "-",
      helper: context.features.colors.palette.map((entry) => `${entry.name} ${(entry.ratio * 100).toFixed(0)}%`).join(", "),
    });
  }
  return telemetry;
}

function renderTelemetry(items = []) {
  dom.telemetryGrid.innerHTML = items
    .map(
      (item) => `
      <div class="telemetry-card">
        <strong>${item.value}</strong>
        <div>${item.label}</div>
        <small>${item.helper ?? ""}</small>
      </div>
    `
    )
    .join("");
}

function evaluateCaptureQuality(imageData) {
  const sharpness = computeSharpness(imageData);
  const brightness = computeBrightness(imageData);
  const exposureScore = balanceExposure(brightness);
  const score = clampAverage([sharpness * 0.7 + exposureScore * 0.3]);
  return { sharpness, brightness, exposureScore, score };
}

function balanceExposure(brightness) {
  if (brightness === undefined) return 0.5;
  const ideal = 0.58;
  const diff = Math.abs(brightness - ideal);
  return clamp(1 - diff * 1.6, 0, 1);
}

function clampAverage(values) {
  const filtered = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!filtered.length) return 0.5;
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return clamp(sum / filtered.length, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function appendLog(message, data) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
  dom.debugLog.textContent = `${entry}\n${dom.debugLog.textContent}`.slice(0, 8000);
  console.info(message, data ?? "");
}

async function createCaptureFromFile(file) {
  if (!file) {
    throw new Error("파일이 선택되지 않았습니다.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  const dataUrl = await readFileAsDataURL(file);
  const imageElement = await loadImageElement(dataUrl);
  const naturalWidth = imageElement.naturalWidth || imageElement.width;
  const naturalHeight = imageElement.naturalHeight || imageElement.height;
  if (!naturalWidth || !naturalHeight) {
    throw new Error("이미지 크기를 확인할 수 없습니다.");
  }

  const { width, height } = scaleDimensions(naturalWidth, naturalHeight, MAX_UPLOAD_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("캔버스를 초기화하지 못했습니다.");
  }
  ctx.drawImage(imageElement, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const normalizedDataUrl = canvas.toDataURL("image/jpeg", 0.92);

  return {
    width,
    height,
    canvas,
    dataUrl: normalizedDataUrl,
    blob: file,
    imageData,
    capturedAt: Date.now(),
    source: "upload",
    name: file.name,
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("파일을 데이터 URL로 변환하지 못했습니다."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

function scaleDimensions(width, height, maxDimension) {
  if (!maxDimension) {
    return { width, height };
  }
  const largest = Math.max(width, height);
  if (!largest || largest <= maxDimension) {
    return { width, height };
  }
  const ratio = maxDimension / largest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}
