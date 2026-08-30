import type { Draft, ResearchPayload } from "@/lib/types";
import { isDraft, isResearchPayload } from "@/lib/validation";

const VERSION = "v2";
const KEYS = {
  draft: `olive-better:${VERSION}:draft`,
  research: `olive-better:${VERSION}:research-cache`
} as const;

const LEGACY_KEYS = {
  draft: "olive-better:draft",
  research: "olive-better:research-cache"
} as const;

const OBSOLETE_KEYS = [
  `olive-better:${VERSION}:published`,
  `olive-better:${VERSION}:events`,
  "olive-better:published",
  "olive-better:events"
];

type Slot = keyof typeof KEYS;

const rawCache = new Map<string, string | null>();
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
  for (const key of [
    ...Object.values(KEYS),
    ...Object.values(LEGACY_KEYS),
    ...OBSOLETE_KEYS
  ]) {
    removeRaw(key);
  }
}
