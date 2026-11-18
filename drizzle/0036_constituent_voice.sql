CREATE TABLE `access_links` (
	`nonce` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	CONSTRAINT "access_links_kind" CHECK("access_links"."kind" IN ('office', 'association'))
);
--> statement-breakpoint
CREATE INDEX `access_links_subject_idx` ON `access_links` (`kind`,`subject_id`);--> statement-breakpoint
CREATE TABLE `association_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`association_id` text NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "association_admins_status" CHECK("association_admins"."status" IN ('pending', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `association_admins_uq` ON `association_admins` (`association_id`,`email_hash`);--> statement-breakpoint
CREATE TABLE `association_members` (
	`association_id` text NOT NULL,
	`account_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`association_id`, `account_id`),
	FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `association_members_account_idx` ON `association_members` (`account_id`);--> statement-breakpoint
CREATE TABLE `associations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`join_code_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	CONSTRAINT "associations_status" CHECK("associations"."status" IN ('pending', 'active', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `associations_slug_uq` ON `associations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `associations_code_uq` ON `associations` (`join_code_hash`);--> statement-breakpoint
CREATE TABLE `bill_jurisdictions` (
	`bill_key` text PRIMARY KEY NOT NULL,
	`jurisdiction` text NOT NULL,
	`level` text NOT NULL,
	`set_at` integer NOT NULL,
	CONSTRAINT "bill_jurisdictions_level" CHECK("bill_jurisdictions"."level" IN ('federal', 'state'))
);
--> statement-breakpoint
CREATE INDEX `bill_jurisdictions_idx` ON `bill_jurisdictions` (`jurisdiction`);--> statement-breakpoint
CREATE TABLE `mail_postcards` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`code_id` text NOT NULL,
	`address_key` text NOT NULL,
	`vendor` text NOT NULL,
	`vendor_ref` text,
	`status` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mail_postcards_status" CHECK("mail_postcards"."status" IN ('queued', 'mock', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `mail_postcards_account_idx` ON `mail_postcards` (`account_id`);--> statement-breakpoint
CREATE INDEX `mail_postcards_address_idx` ON `mail_postcards` (`address_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `mail_postcards_month_idx` ON `mail_postcards` (`created_at`);--> statement-breakpoint
CREATE TABLE `office_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`domain` text NOT NULL,
	`member_key` text NOT NULL,
	`level` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`weekly_email` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`email_verified_at` integer,
	`decided_at` integer,
	`decided_by` text,
	`last_seen_at` integer,
	CONSTRAINT "office_accounts_level" CHECK("office_accounts"."level" IN ('federal', 'state')),
	CONSTRAINT "office_accounts_status" CHECK("office_accounts"."status" IN ('pending', 'review', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_accounts_email_uq` ON `office_accounts` (`email_hash`);--> statement-breakpoint
CREATE INDEX `office_accounts_member_idx` ON `office_accounts` (`member_key`,`status`);--> statement-breakpoint
CREATE TABLE `office_email_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`office_account_id` text NOT NULL,
	`week` text NOT NULL,
	`sent_at` integer NOT NULL,
	`items` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`office_account_id`) REFERENCES `office_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_email_sends_week_uq` ON `office_email_sends` (`office_account_id`,`week`);--> statement-breakpoint
CREATE TABLE `voice_legacy_choices` (
	`user_id` text PRIMARY KEY NOT NULL,
	`imported` integer NOT NULL,
	`imported_at` integer NOT NULL,
	`choice` text,
	`decided_at` integer,
	CONSTRAINT "voice_legacy_choice" CHECK("voice_legacy_choices"."choice" IS NULL OR "voice_legacy_choices"."choice" IN ('count', 'private'))
);
--> statement-breakpoint
CREATE TABLE `voice_totals` (
	`bill_key` text NOT NULL,
	`scope` text NOT NULL,
	`tier` text NOT NULL,
	`support` integer NOT NULL,
	`oppose` integer NOT NULL,
	`unsure` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`bill_key`, `scope`, `tier`),
	CONSTRAINT "voice_totals_tier" CHECK("voice_totals"."tier" IN ('mail', 'address'))
);
--> statement-breakpoint
CREATE INDEX `voice_totals_scope_idx` ON `voice_totals` (`scope`);--> statement-breakpoint
CREATE TABLE `voice_votes` (
	`user_id` text NOT NULL,
	`bill_key` text NOT NULL,
	`account_id` text,
	`answer` text NOT NULL,
	`reason` text,
	`reason_hash` text,
	`counts` integer DEFAULT 1 NOT NULL,
	`device` text,
	`ip_range` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bill_key`),
	CONSTRAINT "voice_votes_answer" CHECK("voice_votes"."answer" IN ('support', 'oppose', 'unsure'))
);
--> statement-breakpoint
CREATE INDEX `voice_votes_bill_idx` ON `voice_votes` (`bill_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `voice_votes_account_idx` ON `voice_votes` (`account_id`);--> statement-breakpoint
CREATE INDEX `voice_votes_reason_idx` ON `voice_votes` (`reason_hash`);