CREATE TABLE `tx_summaries` (
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
	`eligibility` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`reviewed_at` integer,
	CONSTRAINT "tx_summaries_status" CHECK("tx_summaries"."status" IN ('visible', 'held', 'rejected')),
	CONSTRAINT "tx_summaries_confidence" CHECK("tx_summaries"."confidence" IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tx_summaries_bill_uq` ON `tx_summaries` (`bill_id`);--> statement-breakpoint
CREATE INDEX `tx_summaries_status_idx` ON `tx_summaries` (`status`);--> statement-breakpoint
CREATE TABLE `tx_summary_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`passed` integer NOT NULL,
	`failures` text NOT NULL,
	`warnings` text NOT NULL,
	`metrics` text NOT NULL,
	`repairs` text NOT NULL,
	`model` text NOT NULL,
	`cost_usd` real NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_summary_checks_summary_idx` ON `tx_summary_checks` (`summary_id`);--> statement-breakpoint
CREATE TABLE `tx_summary_details` (
	`summary_id` text PRIMARY KEY NOT NULL,
	`plain_english` text NOT NULL,
	`question` text NOT NULL,
	`source_docs` text NOT NULL,
	`fiscal` text,
	`notes` text NOT NULL,
	`unread` text NOT NULL,
	`prompt_version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tx_summary_reader_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`passed` integer NOT NULL,
	`headline` text NOT NULL,
	`plain_english` text NOT NULL,
	`reader` text NOT NULL,
	`judge` text NOT NULL,
	`reasons` text NOT NULL,
	`cost_usd` real NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_summary_reader_tests_summary_idx` ON `tx_summary_reader_tests` (`summary_id`,`at`);--> statement-breakpoint
CREATE TABLE `tx_summary_review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`reviewer_key` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tx_summary_queue_reason" CHECK("tx_summary_review_queue"."reason" IN ('sample', 'low_confidence', 'check_failed')),
	CONSTRAINT "tx_summary_queue_status" CHECK("tx_summary_review_queue"."status" IN ('open', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tx_summary_queue_summary_uq` ON `tx_summary_review_queue` (`summary_id`);--> statement-breakpoint
CREATE INDEX `tx_summary_queue_status_idx` ON `tx_summary_review_queue` (`status`);--> statement-breakpoint
CREATE TABLE `tx_summary_structure` (
	`summary_id` text PRIMARY KEY NOT NULL,
	`how_it_works_today` text NOT NULL,
	`changes` text NOT NULL,
	`why_now` text NOT NULL,
	`primers` text NOT NULL,
	`prompt_version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tx_summary_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`text_version` text NOT NULL,
	`content` text NOT NULL,
	`check_passed` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`replaced_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `tx_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_summary_versions_summary_idx` ON `tx_summary_versions` (`summary_id`);