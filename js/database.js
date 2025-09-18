import { colorMatchScore } from "./color.js";
import { normalizeImprint } from "./ocr.js";
import { deriveScorelineType, normalizeShapeName, levenshtein } from "./scoring.js";

const DB_NAME = "mfds-pill-cache";
const STORE_NAME = "pills";

function isIndexedDbSupported() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (_) {
    return false;
  }
}

function deriveMemoryKey(item) {
  if (item?.itemSeq) {
    const trimmed = String(item.itemSeq).trim();
    if (trimmed) {
      return trimmed;
    }
  }
  const fallbackParts = [item?.itemName, item?.printFront, item?.printBack, item?.entpName]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (fallbackParts.length) {
    return fallbackParts.join("|");
  }
  return `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class PillDatabase {
  constructor({ name = DB_NAME, version = 1 } = {}) {
    this.name = name;
    this.version = version;
    this.dbPromise = null;
    this.memoryStore = new Map();
    this.useMemory = !isIndexedDbSupported();
    this.storageMode = this.useMemory ? "memory" : "indexeddb";
    if (this.useMemory) {
      this.dbPromise = Promise.resolve(null);
    }
  }

  async open() {
    if (this.dbPromise) {
      try {
        return await this.dbPromise;
      } catch (error) {
        this.enableMemoryFallback(error);
        return null;
      }
    }
    if (this.useMemory) {
      this.dbPromise = Promise.resolve(null);
      return null;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(this.name, this.version);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "itemSeq" });
          store.createIndex("printFront", "printFront", { unique: false });
          store.createIndex("printBack", "printBack", { unique: false });
          store.createIndex("colorClass1", "colorClass1", { unique: false });
          store.createIndex("colorClass2", "colorClass2", { unique: false });
          store.createIndex("drugShape", "drugShape", { unique: false });
        }
      };
      request.onsuccess = () => {
        this.storageMode = "indexeddb";
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });

    try {
      const db = await this.dbPromise;
      return db;
    } catch (error) {
      this.enableMemoryFallback(error);
      return null;
    }
  }

  async clear() {
    const db = await this.open();
    if (this.useMemory || !db) {
      this.memoryStore.clear();
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this.enableMemoryFallback(tx.error);
          this.memoryStore.clear();
          resolve();
        };
        tx.objectStore(STORE_NAME).clear();
      } catch (error) {
        this.enableMemoryFallback(error);
        this.memoryStore.clear();
        resolve();
      }
    });
  }

  async bulkPut(items = []) {
    if (!items.length) return;
    const db = await this.open();
    if (this.useMemory || !db) {
      this.writeToMemory(items);
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          this.enableMemoryFallback(tx.error);
          this.writeToMemory(items);
          resolve();
        };
      } catch (error) {
        this.enableMemoryFallback(error);
        this.writeToMemory(items);
        resolve();
      }
    });
  }

  async count() {
    const db = await this.open();
    if (this.useMemory || !db) {
      return this.memoryStore.size;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result ?? 0);
        request.onerror = () => {
          this.enableMemoryFallback(request.error);
          resolve(this.memoryStore.size);
        };
      } catch (error) {
        this.enableMemoryFallback(error);
        resolve(this.memoryStore.size);
      }
    });
  }

  async hasAny() {
    return (await this.count()) > 0;
  }

  async searchByFeatures(features = {}, options = {}) {
    const limit = options.limit ?? 300;
    const db = await this.open();
    if (this.useMemory || !db) {
      const items = Array.from(this.memoryStore.values());
      const scored = scoreCandidates(items, features);
      return scored.slice(0, limit).map((entry) => entry.item);
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const items = request.result ?? [];
          const scored = scoreCandidates(items, features);
          resolve(scored.slice(0, limit).map((entry) => entry.item));
        };
        request.onerror = () => {
          this.enableMemoryFallback(request.error);
          const items = Array.from(this.memoryStore.values());
          const scored = scoreCandidates(items, features);
          resolve(scored.slice(0, limit).map((entry) => entry.item));
        };
      } catch (error) {
        this.enableMemoryFallback(error);
        const items = Array.from(this.memoryStore.values());
        const scored = scoreCandidates(items, features);
        resolve(scored.slice(0, limit).map((entry) => entry.item));
      }
    });
  }

  getStorageMode() {
    return this.storageMode;
  }

  writeToMemory(items = []) {
    if (!items.length) return;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const stored = { ...item };
      const key = deriveMemoryKey(stored);
      stored.itemSeq = key;
      this.memoryStore.set(key, stored);
    }
  }

  enableMemoryFallback(error) {
    if (this.useMemory) return;
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("IndexedDB unavailable, falling back to in-memory store", error);
    }
    this.useMemory = true;
    this.storageMode = "memory";
    this.memoryStore = new Map();
    this.dbPromise = Promise.resolve(null);
  }
}

function scoreCandidates(items, features) {
  const imprintFront = normalizeImprint(features?.imprint?.front?.text ?? "");
  const imprintBack = normalizeImprint(features?.imprint?.back?.text ?? "");
  const primaryColor = features?.colors?.primary?.name ?? "";
  const secondaryColor = features?.colors?.secondary?.name ?? "";
  const shape = features?.shape?.name ?? "";
  const scoreline = features?.scoreline?.type ?? "";

  return items
    .map((item) => {
      const frontScore = approximateImprintScore(imprintFront, item.printFront, item.printBack);
      const backScore = approximateImprintScore(imprintBack, item.printBack, item.printFront);
      const colorScore =
        colorMatchScore(primaryColor, [item.colorClass1, item.colorClass2]) * 0.7 +
        colorMatchScore(secondaryColor, [item.colorClass1, item.colorClass2]) * 0.3;
      const shapeScore = approximateShapeScore(shape, item.drugShape);
      const scorelineScore = approximateScorelineScore(scoreline, item);
      const weight =
        frontScore * 0.45 +
        backScore * 0.25 +
        colorScore * 0.15 +
        shapeScore * 0.1 +
        scorelineScore * 0.05;
      return { item, weight };
    })
    .sort((a, b) => b.weight - a.weight);
}

function approximateImprintScore(query, primary, secondary) {
  if (!query) return 0.4;
  const targets = [normalizeImprint(primary), normalizeImprint(secondary)].filter(Boolean);
  if (!targets.length) return 0.2;
  let best = 0.15;
  for (const candidate of targets) {
    if (!candidate) continue;
    if (candidate === query) {
      return 1;
    }
    if (candidate.includes(query) || query.includes(candidate)) {
      const ratio = candidate.length && query.length ? Math.min(candidate.length, query.length) / Math.max(candidate.length, query.length) : 0.6;
      best = Math.max(best, 0.6 + ratio * 0.4);
      continue;
    }
    if (candidate.length && query.length) {
      const distance = levenshtein(candidate, query);
      const maxLen = Math.max(candidate.length, query.length);
      const similarity = maxLen ? 1 - distance / maxLen : 0;
      best = Math.max(best, Math.max(similarity, 0.05));
    }
  }
  return best;
}

function approximateShapeScore(predicted, candidate) {
  if (!predicted) return 0.35;
  const normalized = normalizeShapeName(candidate);
  if (!normalized) return 0.25;
  if (normalized === predicted) return 1;
  if (predicted === "캡슐형" && normalized.includes("장방")) return 0.65;
  if (predicted === "타원형" && normalized.includes("원")) return 0.6;
  return 0.4;
}

function approximateScorelineScore(expected, item) {
  if (!expected) return 0.4;
  const candidate = deriveScorelineType(item);
  if (!candidate && expected === "없음") return 0.7;
  if (candidate === expected) return 1;
  return 0.4;
}
