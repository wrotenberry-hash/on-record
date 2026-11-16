CREATE TABLE `briefing_subscriptions` (
	`account_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_sent_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `reader_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `briefings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`emailed_at` integer
);
--> statement-breakpoint
CREATE INDEX `briefings_created_idx` ON `briefings` (`created_at`);--> statement-breakpoint
CREATE TABLE `reader_visits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_seen_at` integer NOT NULL,
	`previous_seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`user_id` text NOT NULL,
	`item_key` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`remind_at` integer NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_key`)
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`remind_at`);