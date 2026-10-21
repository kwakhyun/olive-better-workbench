import { getD1Binding } from "@/db";
import type { CustomerEvent, Draft, ResearchPayload } from "@/lib/types";
import { isDraft, isResearchPayload } from "@/lib/validation";

const ACTIVE_CAMPAIGN_ID = "active";
const MAX_EVENTS = 200;

type CachedResearch = {
  payload: ResearchPayload;
  expiresAt: number;
};

const memory = {
  campaign: null as Draft | null,
  events: [] as CustomerEvent[],
  research: new Map<string, CachedResearch>(),
  rateLimits: new Map<string, { count: number; resetAt: number }>()
};

function database() {
  const binding = getD1Binding();
  if (!binding && process.env.NODE_ENV === "production") {
    throw new Error("공유 저장소에 연결하지 못했습니다.");
  }
  return binding;
}

function parseJson<T>(value: string, validate: (input: unknown) => input is T) {
  try {
    const parsed: unknown = JSON.parse(value);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readPublishedCampaign() {
  const db = database();
  if (!db) return memory.campaign;
  const row = await db
    .prepare("SELECT draft_json AS draftJson FROM campaign_publications WHERE id = ?")
    .bind(ACTIVE_CAMPAIGN_ID)
    .first<{ draftJson: string }>();
  return row ? parseJson(row.draftJson, isDraft) : null;
}

export async function publishCampaign(draft: Draft) {
  const db = database();
  if (!db) {
    memory.campaign = draft;
    return;
  }
  await db
    .prepare(
      `INSERT INTO campaign_publications (id, draft_json, published_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         draft_json = excluded.draft_json,
         published_at = excluded.published_at`
    )
    .bind(ACTIVE_CAMPAIGN_ID, JSON.stringify(draft), draft.publishedAt ?? new Date().toISOString())
    .run();
}

export async function appendCustomerEvent(event: CustomerEvent, campaignId: string) {
  const db = database();
  if (!db) {
    memory.events = [...memory.events, event].slice(-MAX_EVENTS);
    return memory.events.length;
  }
  await db
    .prepare(
      `INSERT INTO customer_events
       (id, campaign_id, type, product_id, block_id, well, occurred_at, publication_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      campaignId,
      event.type,
      event.productId ?? null,
      event.blockId ?? null,
      event.well ?? null,
      event.at,
      event.publicationId ?? null
    )
    .run();
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM customer_events WHERE campaign_id = ?")
    .bind(campaignId)
    .first<{ count: number }>();
  return Number(count?.count ?? 0);
}

export async function readRecentCustomerEvents(limit = MAX_EVENTS) {
  const db = database();
  if (!db) return memory.events.slice(-limit);
  const result = await db
    .prepare(
      `SELECT id, campaign_id AS campaignId, publication_id AS publicationId,
              type, product_id AS productId, block_id AS blockId,
              well, occurred_at AS at
       FROM customer_events
       ORDER BY occurred_at DESC
       LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), MAX_EVENTS))
    .all<CustomerEvent>();
  return result.results.reverse();
}

export async function readResearchCache(cacheKey: string) {
  const now = Date.now();
  const db = database();
  if (!db) {
    const cached = memory.research.get(cacheKey);
    return cached && cached.expiresAt > now ? cached.payload : null;
  }
  const row = await db
    .prepare(
      "SELECT payload_json AS payloadJson FROM research_cache WHERE cache_key = ? AND expires_at > ?"
    )
    .bind(cacheKey, now)
    .first<{ payloadJson: string }>();
  return row ? parseJson(row.payloadJson, isResearchPayload) : null;
}

export async function writeResearchCache(
  cacheKey: string,
  payload: ResearchPayload,
  ttlMs: number
) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const db = database();
  if (!db) {
    memory.research.set(cacheKey, { payload, expiresAt });
    return;
  }
  await db
    .prepare(
      `INSERT INTO research_cache (cache_key, payload_json, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
    )
    .bind(cacheKey, JSON.stringify(payload), expiresAt, now)
    .run();
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function researchCacheKey(request: string, well: string) {
  return digest(`${well.trim()}\n${request.trim().toLowerCase()}`);
}

export async function consumeRateLimit(
  scope: string,
  request: Request,
  limit: number,
  windowMs = 60_000
) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const clientAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const bucket = `${scope}:${await digest(clientAddress)}:${windowStart}`;
  const resetAt = windowStart + windowMs;
  const db = database();
  let count: number;

  if (!db) {
    const current = memory.rateLimits.get(bucket);
    count = (current?.count ?? 0) + 1;
    memory.rateLimits.set(bucket, { count, resetAt });
  } else {
    const row = await db
      .prepare(
        `INSERT INTO api_rate_limits (bucket, count, reset_at)
         VALUES (?, 1, ?)
         ON CONFLICT(bucket) DO UPDATE SET count = count + 1
         RETURNING count`
      )
      .bind(bucket, resetAt)
      .first<{ count: number }>();
    count = Number(row?.count ?? limit + 1);
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt
  };
}
