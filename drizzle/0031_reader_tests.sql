CREATE TABLE `analysis_reader_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`passed` integer NOT NULL,
	`headline` text NOT NULL,
	`plain_english` text NOT NULL,
	`reader` text NOT NULL,
	`judge` text NOT NULL,
	`reasons` text NOT NULL,
	`cost_usd` real NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `analysis_bill_summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `analysis_reader_tests_summary_idx` ON `analysis_reader_tests` (`summary_id`,`at`);--> statement-breakpoint
CREATE INDEX `analysis_reader_tests_at_idx` ON `analysis_reader_tests` (`at`);