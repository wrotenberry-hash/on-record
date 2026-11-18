CREATE TABLE `account_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_holds_kind" CHECK("account_holds"."kind" IN ('household_cap', 'device_addresses', 'network_addresses', 'district_cluster', 'address_changes')),
	CONSTRAINT "account_holds_status" CHECK("account_holds"."status" IN ('open', 'cleared', 'confirmed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_holds_uq` ON `account_holds` (`account_id`,`kind`,`subject`);--> statement-breakpoint
CREATE INDEX `account_holds_status_idx` ON `account_holds` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `account_residences` (
	`account_id` text PRIMARY KEY NOT NULL,
	`address_key` text NOT NULL,
	`building_key` text NOT NULL,
	`has_unit` integer DEFAULT 0 NOT NULL,
	`congressional` text NOT NULL,
	`state_code` text NOT NULL,
	`state_upper` text,
	`state_lower` text,
	`set_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `residence_address_idx` ON `account_residences` (`address_key`);--> statement-breakpoint
CREATE INDEX `residence_building_idx` ON `account_residences` (`building_key`);--> statement-breakpoint
CREATE INDEX `residence_cd_idx` ON `account_residences` (`congressional`,`set_at`);--> statement-breakpoint
CREATE TABLE `mail_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`account_id` text NOT NULL,
	`address_key` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`redeemed_at` integer,
	`redeemed_by` text,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_codes_hash_uq` ON `mail_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `mail_codes_account_idx` ON `mail_codes` (`account_id`);--> statement-breakpoint
CREATE TABLE `mail_verifications` (
	`account_id` text PRIMARY KEY NOT NULL,
	`address_key` text NOT NULL,
	`phone_hash` text NOT NULL,
	`code_id` text NOT NULL,
	`verified_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_verifications_code_uq` ON `mail_verifications` (`code_id`);--> statement-breakpoint
CREATE INDEX `mail_verifications_phone_idx` ON `mail_verifications` (`phone_hash`);--> statement-breakpoint
CREATE TABLE `phone_holds` (
	`phone_hash` text PRIMARY KEY NOT NULL,
	`released_at` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `phone_holds_until_idx` ON `phone_holds` (`until`);--> statement-breakpoint
CREATE TABLE `position_residences` (
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`account_id` text NOT NULL,
	`congressional` text NOT NULL,
	`state_code` text NOT NULL,
	`state_upper` text,
	`state_lower` text,
	`stamped_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bill_id`),
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `position_residences_account_idx` ON `position_residences` (`account_id`);--> statement-breakpoint
CREATE TABLE `residence_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`from_address_key` text,
	`to_address_key` text NOT NULL,
	`from_congressional` text,
	`to_congressional` text,
	`device` text,
	`ip_range` text,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "residence_changes_kind" CHECK("residence_changes"."kind" IN ('first', 'change', 'refused'))
);
--> statement-breakpoint
CREATE INDEX `residence_changes_account_idx` ON `residence_changes` (`account_id`,`at`);--> statement-breakpoint
CREATE INDEX `residence_changes_device_idx` ON `residence_changes` (`device`,`at`);--> statement-breakpoint
CREATE INDEX `residence_changes_ip_idx` ON `residence_changes` (`ip_range`,`at`);