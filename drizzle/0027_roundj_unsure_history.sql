CREATE TABLE `position_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`stance` text NOT NULL,
	`reason` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `position_history_user_bill_idx` ON `position_history` (`user_id`,`bill_id`,`at`);--> statement-breakpoint
CREATE TABLE `reader_unsure` (
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `bill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
