CREATE TABLE `counted_positions` (
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`account_id` text NOT NULL,
	`stance` text NOT NULL,
	`tier` integer NOT NULL,
	`reason` text,
	`reason_hash` text,
	`device` text,
	`ip_range` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "counted_stance" CHECK("counted_positions"."stance" IN ('support', 'oppose'))
);
--> statement-breakpoint
CREATE INDEX `counted_bill_idx` ON `counted_positions` (`bill_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `counted_account_idx` ON `counted_positions` (`account_id`);--> statement-breakpoint
CREATE INDEX `counted_reason_idx` ON `counted_positions` (`reason_hash`);--> statement-breakpoint
CREATE TABLE `flagged_positions` (
	`flag_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	PRIMARY KEY(`flag_id`, `user_id`, `bill_id`),
	FOREIGN KEY (`flag_id`) REFERENCES `integrity_flags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `flagged_positions_user_idx` ON `flagged_positions` (`user_id`,`bill_id`);--> statement-breakpoint
CREATE TABLE `integrity_counts` (
	`month` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`n` integer NOT NULL,
	PRIMARY KEY(`month`, `kind`, `reason`)
);
--> statement-breakpoint
CREATE TABLE `integrity_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE INDEX `integrity_flags_status_idx` ON `integrity_flags` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `integrity_flags_subject_idx` ON `integrity_flags` (`kind`,`subject`);--> statement-breakpoint
CREATE TABLE `link_challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`passed_at` integer NOT NULL,
	`ip_range` text,
	`device` text
);
--> statement-breakpoint
CREATE TABLE `rate_events` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`action` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_events_key_idx` ON `rate_events` (`key`,`action`,`at`);--> statement-breakpoint
CREATE INDEX `rate_events_at_idx` ON `rate_events` (`at`);--> statement-breakpoint
CREATE TABLE `sentiment_totals` (
	`bill_id` text NOT NULL,
	`scope` text NOT NULL,
	`tier_group` text NOT NULL,
	`support` integer NOT NULL,
	`oppose` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `scope`, `tier_group`)
);
--> statement-breakpoint
CREATE INDEX `sentiment_scope_idx` ON `sentiment_totals` (`scope`,`tier_group`);--> statement-breakpoint
CREATE TABLE `verification_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`signup_challenge_at` integer,
	`first_vote_challenge_at` integer,
	`phone_hash` text,
	`phone_line_type` text,
	`phone_verified_at` integer,
	`pending_phone_hash` text,
	`pending_phone_at` integer,
	`district_id` text,
	`state_code` text,
	`address_cipher` text,
	`address_matched_at` integer,
	`signup_ip_range` text,
	`signup_device` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "verification_tier" CHECK("verification_profiles"."tier" IN (0, 1, 2))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_phone_uq` ON `verification_profiles` (`phone_hash`);--> statement-breakpoint
CREATE INDEX `verification_ip_idx` ON `verification_profiles` (`signup_ip_range`);--> statement-breakpoint
CREATE INDEX `verification_device_idx` ON `verification_profiles` (`signup_device`);--> statement-breakpoint
CREATE INDEX `verification_district_idx` ON `verification_profiles` (`district_id`);