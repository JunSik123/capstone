export const REMOTE_BASE_URL =
  "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService02/getMdcinGrnIdntfcInfoList01";
const LOCAL_PROXY_PATH = "/proxy/mfds";

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
    if (!response.ok) {
      throw new Error(`MFDS API 호출 실패: ${response.status} ${response.statusText}`);
    }

    if (this.responseType === "xml") {
      const text = await response.text();
      return { raw: text };
    }

    const payload = await response.json();
    const header = payload?.response?.header ?? {};
    if (header.resultCode && header.resultCode !== "00") {
      throw new Error(`MFDS API 오류: ${header.resultMsg ?? header.resultCode}`);
    }
    const body = payload?.response?.body ?? {};
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
    const delayMs = options.delayMs ?? 0;
    const onPage = options.onPage;

    const aggregated = shouldCollect ? [] : null;
    let totalCount = null;
    let fetched = 0;
    let pageNo = startPage;

    while (true) {
      const response = await this.search({ ...params, pageNo, numOfRows: pageSize });
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
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    entpName: normalizeField(item.ENTP_NAME),
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
    materialName: normalizeField(item.MATERIAL_NAME),
    permitDate: normalizeField(item.PRMS_DT),
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
