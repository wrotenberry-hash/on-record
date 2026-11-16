CREATE TABLE `category_suggestions` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`category_slug` text,
	`confidence` real NOT NULL,
	`rationale` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	CONSTRAINT "category_suggestions_status" CHECK("category_suggestions"."status" IN ('applied', 'queued', 'approved', 'rejected', 'no_fit'))
);
--> statement-breakpoint
CREATE INDEX `category_suggestions_status_idx` ON `category_suggestions` (`status`);--> statement-breakpoint
CREATE TABLE `official_bill_cosponsors` (
	`bill_id` text NOT NULL,
	`politician_id` text NOT NULL,
	`sponsorship_date` text,
	`original` integer DEFAULT 0 NOT NULL,
	`withdrawn_date` text,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `politician_id`),
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `official_bill_cosponsors_politician_idx` ON `official_bill_cosponsors` (`politician_id`);--> statement-breakpoint
CREATE TABLE `official_sponsorship_fetches` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`fetched_at` integer NOT NULL,
	`cosponsors` integer NOT NULL,
	`ok` integer NOT NULL
);
