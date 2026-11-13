CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`external_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "app_users_kind" CHECK("app_users"."kind" IN ('editor', 'public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_external_uq` ON `app_users` (`external_key`);--> statement-breakpoint
CREATE TABLE `bill_categories` (
	`bill_id` text NOT NULL,
	`category_slug` text NOT NULL,
	`method` text NOT NULL,
	`mapping_id` text,
	`confidence` real,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `category_slug`),
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_slug`) REFERENCES `issue_categories`(`slug`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_categories_method" CHECK("bill_categories"."method" IN ('mapping', 'editor', 'ai'))
);
--> statement-breakpoint
CREATE INDEX `bill_categories_slug_idx` ON `bill_categories` (`category_slug`);--> statement-breakpoint
CREATE TABLE `category_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text NOT NULL,
	`match_kind` text NOT NULL,
	`source_value` text NOT NULL,
	`category_slug` text NOT NULL,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_slug`) REFERENCES `issue_categories`(`slug`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_mappings_kind" CHECK("category_mappings"."source_kind" IN ('policy_area', 'subject') AND "category_mappings"."match_kind" IN ('exact', 'contains'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_mappings_uq` ON `category_mappings` (`source_kind`,`match_kind`,`source_value`,`category_slug`);--> statement-breakpoint
CREATE TABLE `ingest_cursors` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`detail` text,
	`error` text,
	CONSTRAINT "ingest_runs_status" CHECK("ingest_runs"."status" IN ('RUNNING', 'COMPLETE', 'PARTIAL', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX `ingest_runs_job_idx` ON `ingest_runs` (`job`,`started_at`);--> statement-breakpoint
CREATE TABLE `issue_categories` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `official_bill_subjects` (
	`bill_id` text NOT NULL,
	`subject` text NOT NULL,
	PRIMARY KEY(`bill_id`, `subject`),
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `official_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`congress` integer NOT NULL,
	`bill_type` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`policy_area` text,
	`introduced_at` text,
	`latest_action_text` text,
	`latest_action_at` text,
	`sponsor_id` text,
	`congress_url` text NOT NULL,
	`detail_status` text DEFAULT 'stub' NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	CONSTRAINT "official_bills_detail" CHECK("official_bills"."detail_status" IN ('stub', 'complete'))
);
--> statement-breakpoint
CREATE INDEX `official_bills_action_idx` ON `official_bills` (`latest_action_at`);--> statement-breakpoint
CREATE INDEX `official_bills_detail_idx` ON `official_bills` (`detail_status`);--> statement-breakpoint
CREATE TABLE `official_member_votes` (
	`roll_call_id` text NOT NULL,
	`politician_id` text NOT NULL,
	`position` text NOT NULL,
	`raw_position` text NOT NULL,
	PRIMARY KEY(`roll_call_id`, `politician_id`),
	FOREIGN KEY (`roll_call_id`) REFERENCES `official_roll_calls`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "official_member_votes_position" CHECK("official_member_votes"."position" IN ('Yea', 'Nay', 'Present', 'Not Voting'))
);
--> statement-breakpoint
CREATE INDEX `official_member_votes_politician_idx` ON `official_member_votes` (`politician_id`);--> statement-breakpoint
CREATE TABLE `official_politicians` (
	`id` text PRIMARY KEY NOT NULL,
	`lis_id` text,
	`govtrack_id` integer,
	`full_name` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`party` text NOT NULL,
	`state` text NOT NULL,
	`district` integer,
	`chamber` text NOT NULL,
	`term_start` text,
	`term_end` text,
	`official_url` text,
	`is_current` integer DEFAULT 1 NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	CONSTRAINT "official_politicians_chamber" CHECK("official_politicians"."chamber" IN ('house', 'senate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `official_politicians_lis_uq` ON `official_politicians` (`lis_id`);--> statement-breakpoint
CREATE INDEX `official_politicians_state_idx` ON `official_politicians` (`state`,`chamber`);--> statement-breakpoint
CREATE TABLE `official_roll_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`chamber` text NOT NULL,
	`congress` integer NOT NULL,
	`session` integer NOT NULL,
	`roll_number` integer NOT NULL,
	`voted_at` integer NOT NULL,
	`question` text NOT NULL,
	`title` text,
	`result` text,
	`document_label` text,
	`bill_id` text,
	`yea` integer DEFAULT 0 NOT NULL,
	`nay` integer DEFAULT 0 NOT NULL,
	`present` integer DEFAULT 0 NOT NULL,
	`not_voting` integer DEFAULT 0 NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	CONSTRAINT "official_roll_calls_chamber" CHECK("official_roll_calls"."chamber" IN ('house', 'senate'))
);
--> statement-breakpoint
CREATE INDEX `official_roll_calls_voted_idx` ON `official_roll_calls` (`voted_at`);--> statement-breakpoint
CREATE INDEX `official_roll_calls_bill_idx` ON `official_roll_calls` (`bill_id`);--> statement-breakpoint
CREATE TABLE `user_follows` (
	`user_id` text NOT NULL,
	`politician_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `politician_id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
