CREATE TABLE `application_events` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`channel` text,
	`notes` text,
	`next_follow_up_at` text,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connector_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`raw_count` integer NOT NULL,
	`normalized_count` integer NOT NULL,
	`rejected_count` integer NOT NULL,
	`http_statuses_seen` text NOT NULL,
	`ok` integer NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_offer_id` text NOT NULL,
	`origin_source` text,
	`canonical_url` text NOT NULL,
	`apply_url` text,
	`title` text NOT NULL,
	`company_name` text NOT NULL,
	`company_normalized_name` text NOT NULL,
	`company_siret` text,
	`company_website` text,
	`location_label` text NOT NULL,
	`city` text NOT NULL,
	`postal_code` text,
	`department` text,
	`lat` real,
	`lng` real,
	`contract_type` text NOT NULL,
	`duration_months` integer,
	`start_date` text,
	`rome_codes` text NOT NULL,
	`description_text` text NOT NULL,
	`description_html` text,
	`salary` text,
	`remote_policy` text,
	`posted_at` text,
	`expires_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`lifecycle` text NOT NULL,
	`dedup_key` text NOT NULL,
	`source_refs` text NOT NULL,
	`raw_payload` text NOT NULL
);
