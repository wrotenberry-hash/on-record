CREATE TABLE `intake_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`lane` text NOT NULL,
	`medium` text NOT NULL,
	`era` text NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`discovered_at` integer NOT NULL,
	`attempted_at` integer,
	`completed_at` integer,
	`case_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_url_uq` ON `intake_candidates` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `candidate_status_idx` ON `intake_candidates` (`status`,`discovered_at`);