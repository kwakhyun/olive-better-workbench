import type { CustomerEvent, Draft, ResearchPayload } from "@/lib/types";

const VERSION = "v2";
const MAX_EVENTS = 200;

const KEYS = {
  draft: `olive-better:${VERSION}:draft`,
  published: `olive-better:${VERSION}:published`,
  events: `olive-better:${VERSION}:events`,
  research: `olive-better:${VERSION}:research-cache`
} as const;

const LEGACY_KEYS = {
  draft: "olive-better:draft",
  published: "olive-better:published",
  events: "olive-better:events",
  research: "olive-better:research-cache"
} as const;

type Slot = keyof typeof KEYS;
type Listener = () => void;

const rawCache = new Map<string, string | null>();
const WELLS = new Set([
  "Eat Well",
  "Nourish Well",
  "Fit Well",
  "Relax Well",
  "Glow Well",
  "Care Well"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDraft(value: unknown): value is Draft {
  if (!isRecord(value)) return false;
  return (
    typeof value.schemaVersion === "string" &&
    typeof value.id === "string" &&
    (value.status === "draft" || value.status === "published") &&
    typeof value.request === "string" &&
    typeof value.well === "string" &&
    WELLS.has(value.well) &&
    Array.isArray(value.blocks) &&
    isRecord(value.products) &&
    isRecord(value.research) &&
    isRecord(value.audit)
  );
}

function isCustomerEvent(value: unknown): value is CustomerEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.at === "string" &&
    (value.type === "click" || value.type === "like" || value.type === "purchase")
  );
}

function isResearchPayload(value: unknown): value is ResearchPayload {
  if (!isRecord(value)) return false;
  return (
    (value.status === "live" || value.status === "cached") &&
    typeof value.topic === "string" &&
    typeof value.fetchedAt === "string" &&
    Array.isArray(value.sources) &&
    Array.isArray(value.signals)
  );
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string) {
  if (rawCache.has(key)) return rawCache.get(key) ?? null;
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    rawCache.set(key, value);
    return value;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string) {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    rawCache.set(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key: string) {
  const storage = browserStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      // 저장소가 비활성화된 브라우저에서도 초기화 흐름은 계속 진행합니다.
    }
  }
  rawCache.delete(key);
}

function readSlot<T>(slot: Slot, validate: (value: unknown) => value is T, fallback: T): T {
  const current = readRaw(KEYS[slot]);
  const legacy = current === null ? readRaw(LEGACY_KEYS[slot]) : null;
  const serialized = current ?? legacy;
  if (serialized === null) return fallback;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!validate(parsed)) return fallback;
    if (current === null && writeRaw(KEYS[slot], serialized)) {
      removeRaw(LEGACY_KEYS[slot]);
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeSlot(slot: Slot, value: unknown) {
  try {
    return writeRaw(KEYS[slot], JSON.stringify(value));
  } catch {
    return false;
  }
}

export function readDraft() {
  return readSlot<Draft | null>(
    "draft",
    (value): value is Draft | null => value === null || isDraft(value),
    null
  );
}

export function saveDraft(draft: Draft) {
  return writeSlot("draft", draft);
}

export function removeDraft() {
  removeRaw(KEYS.draft);
  removeRaw(LEGACY_KEYS.draft);
}

export function readPublished() {
  return readSlot<Draft | null>(
    "published",
    (value): value is Draft | null => value === null || isDraft(value),
    null
  );
}

export function savePublished(draft: Draft) {
  return writeSlot("published", draft);
}

export function readEvents() {
  return readSlot<CustomerEvent[]>(
    "events",
    (value): value is CustomerEvent[] => Array.isArray(value) && value.every(isCustomerEvent),
    []
  );
}

export function appendEvent(event: CustomerEvent) {
  const events = [...readEvents(), event].slice(-MAX_EVENTS);
  return { events, saved: writeSlot("events", events) };
}

export function readResearch() {
  return readSlot<ResearchPayload | null>(
    "research",
    (value): value is ResearchPayload | null => value === null || isResearchPayload(value),
    null
  );
}

export function saveResearch(research: ResearchPayload) {
  return writeSlot("research", research);
}

export function clearAppStorage() {
  for (const key of [...Object.values(KEYS), ...Object.values(LEGACY_KEYS)]) {
    removeRaw(key);
  }
}

export function subscribeToAppStorage(listener: Listener) {
  if (typeof window === "undefined") return () => undefined;
  const knownKeys = new Set<string>([...Object.values(KEYS), ...Object.values(LEGACY_KEYS)]);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && !knownKeys.has(event.key)) return;
    if (event.key) rawCache.delete(event.key);
    else rawCache.clear();
    listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
