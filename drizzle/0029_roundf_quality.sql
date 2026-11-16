CREATE TABLE `analysis_rereviews` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`at` integer NOT NULL,
	`passed` integer NOT NULL,
	`failures` text NOT NULL,
	`prompt_version` text NOT NULL,
	`action` text NOT NULL,
	`error` text,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_rereviews_summary_idx` ON `analysis_rereviews` (`summary_id`,`at`);--> statement-breakpoint
CREATE INDEX `analysis_rereviews_at_idx` ON `analysis_rereviews` (`at`);