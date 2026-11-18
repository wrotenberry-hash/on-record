CREATE TABLE `anon_marks` (
	`kind` text NOT NULL,
	`mark` text NOT NULL,
	`period` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`kind`, `mark`),
	CONSTRAINT "anon_marks_kind" CHECK("anon_marks"."kind" IN ('weekly_open', 'loop_return'))
);
--> statement-breakpoint
CREATE INDEX `anon_marks_period_idx` ON `anon_marks` (`kind`,`period`);--> statement-breakpoint
CREATE TABLE `loop_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bill_key` text NOT NULL,
	`event` text NOT NULL,
	`event_ref` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	`pushed_at` integer,
	`emailed_at` integer,
	`seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "loop_notices_event" CHECK("loop_notices"."event" IN ('floor_vote', 'passed', 'failed', 'signed', 'vetoed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loop_notices_once_uq` ON `loop_notices` (`user_id`,`bill_key`,`event_ref`);--> statement-breakpoint
CREATE INDEX `loop_notices_user_idx` ON `loop_notices` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reader_setup` (
	`user_id` text PRIMARY KEY NOT NULL,
	`place_key` text,
	`defaults_at` integer,
	`issues_asked_at` integer,
	`first_seen_at` integer NOT NULL,
	`week_two_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
