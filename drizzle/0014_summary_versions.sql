CREATE TABLE `analysis_summary_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`content` text NOT NULL,
	`check_passed` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`replaced_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_summary_versions_summary_idx` ON `analysis_summary_versions` (`summary_id`);