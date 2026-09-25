CREATE TABLE `intake_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`lane` text NOT NULL,
	`status` text NOT NULL,
	`source_url` text,
	`case_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intake_day_lane_uq` ON `intake_runs` (`day`,`lane`);