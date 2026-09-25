CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`candidate_id` text,
	`representation_id` text,
	`capture_status` text,
	`research_status` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_slot_uq` ON `automation_runs` (`slot`);--> statement-breakpoint
CREATE INDEX `automation_day_idx` ON `automation_runs` (`day`);