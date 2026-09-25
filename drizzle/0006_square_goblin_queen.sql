CREATE TABLE `machine_research_drafts` (
	`representation_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`support_strategy` text,
	`supporting_summary` text,
	`contrary_strategy` text,
	`contrary_summary` text,
	`citations` text,
	`assessment` text,
	`error` text,
	`attempted_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`representation_id`) REFERENCES `representations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `machine_research_status_idx` ON `machine_research_drafts` (`status`,`attempted_at`);