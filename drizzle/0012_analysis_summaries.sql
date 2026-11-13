CREATE TABLE `analysis_bill_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`text_version` text NOT NULL,
	`text_version_label` text NOT NULL,
	`text_date` text,
	`text_url` text NOT NULL,
	`text_chars` integer NOT NULL,
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
	`attempts` integer NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`sources` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "analysis_summaries_status" CHECK("analysis_bill_summaries"."status" IN ('visible', 'held', 'rejected')),
	CONSTRAINT "analysis_summaries_confidence" CHECK("analysis_bill_summaries"."confidence" IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_summaries_bill_version_uq` ON `analysis_bill_summaries` (`bill_id`,`text_version`);--> statement-breakpoint
CREATE INDEX `analysis_summaries_status_idx` ON `analysis_bill_summaries` (`status`);--> statement-breakpoint
CREATE TABLE `analysis_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`passed` integer NOT NULL,
	`failures` text NOT NULL,
	`warnings` text NOT NULL,
	`metrics` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_checks_summary_idx` ON `analysis_checks` (`summary_id`);--> statement-breakpoint
CREATE TABLE `analysis_review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`reviewer_key` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "analysis_queue_reason" CHECK("analysis_review_queue"."reason" IN ('sample', 'low_confidence', 'check_failed')),
	CONSTRAINT "analysis_queue_status" CHECK("analysis_review_queue"."status" IN ('open', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_queue_summary_uq` ON `analysis_review_queue` (`summary_id`);--> statement-breakpoint
CREATE INDEX `analysis_queue_status_idx` ON `analysis_review_queue` (`status`);--> statement-breakpoint
CREATE TABLE `model_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`ref_id` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`web_search_calls` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`response_id` text,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_calls_created_idx` ON `model_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_calls_ref_idx` ON `model_calls` (`ref_id`);--> statement-breakpoint
CREATE TABLE `official_cost_estimates` (
	`bill_id` text NOT NULL,
	`url` text NOT NULL,
	`pub_date` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `url`),
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action
);
