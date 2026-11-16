CREATE TABLE `case_archive` (
	`representation_id` text PRIMARY KEY NOT NULL,
	`archived_at` integer NOT NULL,
	`reason` text NOT NULL,
	`restored_at` integer
);
--> statement-breakpoint
CREATE TABLE `reader_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`answer` text NOT NULL,
	`audience` text NOT NULL,
	`created_at` integer NOT NULL
);
