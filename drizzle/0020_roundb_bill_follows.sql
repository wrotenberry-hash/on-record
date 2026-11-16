CREATE TABLE `bill_follows` (
	`user_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_stage` text,
	`last_alert_at` integer,
	PRIMARY KEY(`user_id`, `bill_id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_follows_bill_idx` ON `bill_follows` (`bill_id`);