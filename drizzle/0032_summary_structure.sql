CREATE TABLE `analysis_summary_structure` (
	`summary_id` text PRIMARY KEY NOT NULL,
	`how_it_works_today` text NOT NULL,
	`changes` text NOT NULL,
	`why_now` text NOT NULL,
	`primers` text NOT NULL,
	`prompt_version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
