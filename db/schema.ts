import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaignPublications = sqliteTable("campaign_publications", {
  id: text("id").primaryKey(),
  draftJson: text("draft_json").notNull(),
  publishedAt: text("published_at").notNull()
});

export const customerEvents = sqliteTable(
  "customer_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    publicationId: text("publication_id"),
    type: text("type").notNull(),
    productId: text("product_id"),
    blockId: text("block_id"),
    well: text("well"),
    occurredAt: text("occurred_at").notNull()
  },
  (table) => [
    index("customer_events_campaign_idx").on(table.campaignId),
    index("customer_events_occurred_at_idx").on(table.occurredAt)
  ]
);

export const researchCache = sqliteTable("research_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const apiRateLimits = sqliteTable("api_rate_limits", {
  bucket: text("bucket").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull()
});
