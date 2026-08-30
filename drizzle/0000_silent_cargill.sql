CREATE TABLE `api_rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_json` text NOT NULL,
	`published_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`type` text NOT NULL,
	`product_id` text,
	`block_id` text,
	`well` text,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_events_campaign_idx` ON `customer_events` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `customer_events_occurred_at_idx` ON `customer_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `research_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
