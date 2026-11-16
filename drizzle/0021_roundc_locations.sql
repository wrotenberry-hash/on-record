CREATE TABLE `reader_locations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`congressional` text,
	`state_upper` text,
	`state_lower` text,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
