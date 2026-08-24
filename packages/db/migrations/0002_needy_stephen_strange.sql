CREATE TABLE `discovery_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_slug` text NOT NULL,
	`platform` text NOT NULL,
	`found` integer NOT NULL,
	`target` text,
	`probed_at` text NOT NULL
);
