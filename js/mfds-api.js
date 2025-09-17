export const REMOTE_BASE_URL =
  "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService02/getMdcinGrnIdntfcInfoList01";
const LOCAL_PROXY_PATH = "/proxy/mfds";

const DEFAULT_PAGE_DELAY_MS = 200;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const DEFAULT_BASE_URL = resolveDefaultBaseUrl();

export const DEFAULT_SERVICE_KEY_ENCODED = "";
export const DEFAULT_SERVICE_KEY_DECODED = "";

export class MFDSClient {
  constructor({ serviceKey = "", responseType = "json", baseUrl = DEFAULT_BASE_URL } = {}) {
    this.baseUrl = baseUrl;
    this.serviceKey = serviceKey;
    this.responseType = responseType;
  }

  setBaseUrl(baseUrl) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  setServiceKey(key) {
    this.serviceKey = key;
  }

  setResponseType(type) {
    this.responseType = type;
  }

  async search(params = {}) {
    if (!this.serviceKey) {
      throw new Error("서비스 키가 설정되지 않았습니다.");
    }
    const url = new URL(this.baseUrl);
    url.searchParams.set("serviceKey", normalizeServiceKey(this.serviceKey));
    url.searchParams.set("pageNo", params.pageNo ?? 1);
    url.searchParams.set("numOfRows", params.numOfRows ?? 60);
    url.searchParams.set("type", this.responseType ?? "json");

    const mapping = {
      itemName: "item_name",
      entpName: "entp_name",
      drugShape: "drug_shape",
      colorClass1: "color_class1",
      colorClass2: "color_class2",
      lineFront: "line_front",
      lineBack: "line_back",
      printFront: "print_front",
      printBack: "print_back",
    };

    Object.entries(mapping).forEach(([key, queryKey]) => {
      const value = params[key];
      if (value) {
        url.searchParams.set(queryKey, value);
      }
    });

    const response = await fetch(url.toString());
    const rawBody = await response.text();
    const parsedBody = this.responseType === "xml" ? null : tryParseJson(rawBody);

    if (!response.ok) {
      const error = new Error(
        buildHttpErrorMessage(response, parsedBody, rawBody) ??
          `MFDS API 호출 실패: ${response.status} ${response.statusText}`
      );
      error.status = response.status;
      if (parsedBody !== null) {
        error.payload = parsedBody;
      } else if (rawBody) {
        error.body = rawBody;
      }
      throw error;
    }

    if (this.responseType === "xml") {
      return { raw: rawBody };
    }

    if (!parsedBody) {
      const parseError = new Error("MFDS API 응답 파싱 실패: JSON 형식이 아닙니다.");
      parseError.body = rawBody;
      throw parseError;
    }

    const header = parsedBody?.response?.header ?? {};
    if (header.resultCode && header.resultCode !== "00") {
      const apiError = new Error(`MFDS API 오류: ${header.resultMsg ?? header.resultCode}`);
      apiError.status = Number(header.resultCode) || undefined;
      apiError.payload = parsedBody;
      throw apiError;
    }

    const body = parsedBody?.response?.body ?? {};
    const items = normalizeItems(body.items);
    return {
      totalCount: Number(body.totalCount ?? items.length ?? 0),
      pageNo: Number(body.pageNo ?? params.pageNo ?? 1),
      numOfRows: Number(body.numOfRows ?? params.numOfRows ?? 60),
      items,
    };
  }

  async fetchAll(params = {}, options = {}) {
    const pageSize = options.pageSize ?? 100;
    const startPage = options.startPage ?? 1;
    const shouldCollect = options.collect ?? true;
    const pageDelayMs = options.pageDelayMs ?? options.delayMs ?? DEFAULT_PAGE_DELAY_MS;
    const maxRetries = options.retryAttempts ?? options.maxRetries ?? DEFAULT_RETRY_ATTEMPTS;
    const retryDelayMs = options.retryDelayMs ?? options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    const retryBackoff = options.retryBackoff ?? options.retryBackoffMultiplier ?? 2;
    const onPage = options.onPage;
    const onRetry = options.onRetry;

    const aggregated = shouldCollect ? [] : null;
    let totalCount = null;
    let fetched = 0;
    let pageNo = startPage;

    while (true) {
      const response = await retryWithBackoff(
        () => this.search({ ...params, pageNo, numOfRows: pageSize }),
        {
          attempts: Math.max(1, maxRetries),
          initialDelay: Math.max(0, retryDelayMs),
          multiplier: retryBackoff || 1,
          shouldRetry: (error) => isRetryableError(error),
          onRetry: onRetry
            ? (attemptMeta) =>
                onRetry({
                  ...attemptMeta,
                  pageNo,
                })
            : undefined,
        }
      );
      const items = response.items ?? [];
      if (totalCount === null && response.totalCount !== undefined) {
        totalCount = Number(response.totalCount);
      }
      fetched += items.length;

      if (aggregated) {
        aggregated.push(...items);
      }

      await onPage?.({
        pageNo,
        items,
        fetched,
        totalCount,
        pageSize,
        totalPages: totalCount ? Math.ceil(totalCount / pageSize) : null,
      });

      const reachedEnd =
        !items.length || (totalCount !== null && totalCount !== undefined && fetched >= totalCount);
      if (reachedEnd) {
        break;
      }

      pageNo += 1;
      if (pageDelayMs > 0) {
        await sleep(pageDelayMs);
      }
    }

    return {
      totalCount: totalCount ?? fetched,
      fetched,
      items: aggregated ?? [],
    };
  }
}

function resolveDefaultBaseUrl() {
  if (typeof window === "undefined") {
    return REMOTE_BASE_URL;
  }

  try {
    const { origin, hostname } = window.location || {};
    const isLocalHost =
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

    if (origin && origin !== "null" && isLocalHost) {
      return `${origin}${LOCAL_PROXY_PATH}`;
    }
  } catch (_) {
    // fall through to remote base url
  }

  return REMOTE_BASE_URL;
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items.map(normalizeItem);
  if (Array.isArray(items.item)) return items.item.map(normalizeItem);
  return [normalizeItem(items)];
}

function normalizeItem(item = {}) {
  const normalizeField = (value) => (value === null || value === undefined ? "" : String(value).trim());
  return {
    itemSeq: normalizeField(item.ITEM_SEQ),
    itemName: normalizeField(item.ITEM_NAME),
    itemEngName: normalizeField(item.ITEM_ENG_NAME),
    itemPermitDate: normalizeField(item.ITEM_PERMIT_DATE || item.PRMS_DT),
    permitDate: normalizeField(item.PRMS_DT || item.ITEM_PERMIT_DATE),
    entpName: normalizeField(item.ENTP_NAME),
    entpSeq: normalizeField(item.ENTP_SEQ),
    etcOtcName: normalizeField(item.ETC_OTC_NAME),
    className: normalizeField(item.CLASS_NAME),
    classNo: normalizeField(item.CLASS_NO),
    chart: normalizeField(item.CHART),
    colorClass1: normalizeField(item.COLOR_CLASS1),
    colorClass2: normalizeField(item.COLOR_CLASS2),
    formCodeName: normalizeField(item.FORM_CODE_NAME),
    drugShape: normalizeField(item.DRUG_SHAPE),
    printFront: normalizeField(item.PRINT_FRONT),
    printBack: normalizeField(item.PRINT_BACK),
    lineFront: normalizeField(item.LINE_FRONT),
    lineBack: normalizeField(item.LINE_BACK),
    lengLong: normalizeField(item.LENG_LONG),
    lengShort: normalizeField(item.LENG_SHORT),
    thick: normalizeField(item.THICK),
    imageUrl: normalizeField(item.ITEM_IMAGE),
    markCodeFrontAnal: normalizeField(item.MARK_CODE_FRONT_ANAL),
    markCodeBackAnal: normalizeField(item.MARK_CODE_BACK_ANAL),
    markCodeFront: normalizeField(item.MARK_CODE_FRONT),
    markCodeBack: normalizeField(item.MARK_CODE_BACK),
    markCodeFrontImg: normalizeField(item.MARK_CODE_FRONT_IMG),
    markCodeBackImg: normalizeField(item.MARK_CODE_BACK_IMG),
    imageRegisteredAt: normalizeField(item.IMG_REGIST_TS),
    changeDate: normalizeField(item.CHANGE_DATE),
    ediCode: normalizeField(item.EDI_CODE),
    businessNumber: normalizeField(item.BIZRNO),
    standardCode: normalizeField(item.STD_CD),
    materialName: normalizeField(item.MATERIAL_NAME),
  };
}

function normalizeServiceKey(key) {
  if (!key) return "";
  try {
    return decodeURIComponent(key);
  } catch (_) {
    return key;
  }
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function buildHttpErrorMessage(response, payload, rawBody = "") {
  const base = `MFDS API 호출 실패: ${response.status} ${response.statusText}`;
  const header = payload?.response?.header;
  const detail = header?.resultMsg || header?.resultCode || extractSnippet(rawBody);
  return detail ? `${base} (${detail})` : base;
}

function extractSnippet(text) {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

async function sleep(ms) {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (status && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }
  if (!status || status === 0) {
    const message = String(error?.message ?? "").toLowerCase();
    if (!message) return true;
    return ["network", "fetch", "timeout", "failed to fetch", "net::"].some((token) =>
      message.includes(token)
    );
  }
  return false;
}

async function retryWithBackoff(fn, options = {}) {
  const attempts = Math.max(1, options.attempts ?? 1);
  let attempt = 0;
  let delay = options.initialDelay ?? 0;
  const multiplier = options.multiplier && options.multiplier > 0 ? options.multiplier : 1;
  let lastError;

  while (attempt < attempts) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      attempt += 1;
      const shouldRetryFn = options.shouldRetry ?? (() => true);
      if (attempt >= attempts || !shouldRetryFn(error, attempt)) {
        throw error;
      }

      await options.onRetry?.({ attempt, delay, error });
      if (delay > 0) {
        await sleep(delay);
      }
      delay = multiplier > 1 ? delay * multiplier : delay;
    }
  }

  throw lastError;
}
