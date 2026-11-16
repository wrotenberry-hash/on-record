CREATE TABLE `alert_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	`seen_at` integer
);
--> statement-breakpoint
CREATE INDEX `alert_outbox_user_idx` ON `alert_outbox` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `alert_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`instant_votes` integer DEFAULT 0 NOT NULL,
	`instant_bills` integer DEFAULT 1 NOT NULL,
	`push` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint_hash` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`endpoint` text NOT NULL,
	`p256dh` text,
	`auth` text,
	`created_at` integer NOT NULL,
	`last_sent_at` integer,
	`failures` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `reader_issues` (
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `slug`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
