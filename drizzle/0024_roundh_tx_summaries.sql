CREATE TABLE `tx_bill_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`text_url` text NOT NULL,
	`text_label` text NOT NULL,
	`truncated` integer DEFAULT 0 NOT NULL,
	`headline` text NOT NULL,
	`what_it_does` text NOT NULL,
	`who_it_affects` text NOT NULL,
	`what_changes_for_you` text NOT NULL,
	`case_for` text NOT NULL,
	`case_against` text NOT NULL,
	`unknowns` text NOT NULL,
	`confidence` text NOT NULL,
	`confidence_reason` text NOT NULL,
	`check_passed` integer NOT NULL,
	`failures` text,
	`reading_grade` real,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tx_bill_summaries_bill_uq` ON `tx_bill_summaries` (`bill_id`);--> statement-breakpoint
CREATE INDEX `tx_bill_summaries_status_idx` ON `tx_bill_summaries` (`status`);