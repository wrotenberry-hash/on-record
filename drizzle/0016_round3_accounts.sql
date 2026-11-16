CREATE TABLE `digest_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`week` text NOT NULL,
	`sent_at` integer NOT NULL,
	`items` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_sends_week_uq` ON `digest_sends` (`account_id`,`week`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`nonce` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_hash` text NOT NULL,
	`app_user_id` text,
	`invite_id` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `opinion_user_votes` (
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`stance` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `official_bills`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "opinion_user_votes_stance" CHECK("opinion_user_votes"."stance" IN ('support', 'oppose'))
);
--> statement-breakpoint
CREATE TABLE `reader_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`app_user_id` text NOT NULL,
	`invite_id` text,
	`email_hash` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`verified_at` integer,
	`digest_opt_in` integer DEFAULT 1 NOT NULL,
	`last_digest_at` integer,
	FOREIGN KEY (`app_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_accounts_email_uq` ON `reader_accounts` (`email_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `reader_accounts_user_uq` ON `reader_accounts` (`app_user_id`);