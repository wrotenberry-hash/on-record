CREATE TABLE `analysis_summary_details` (
	`summary_id` text PRIMARY KEY NOT NULL,
	`plain_english` text NOT NULL,
	`background` text,
	`background_sources` text NOT NULL,
	`question` text NOT NULL,
	`source_docs` text NOT NULL,
	`prompt_version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
