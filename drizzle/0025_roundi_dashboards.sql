CREATE TABLE `leadership_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`from_name` text,
	`to_name` text
);
--> statement-breakpoint
CREATE TABLE `official_bill_index` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`congress` integer NOT NULL,
	`bill_type` text NOT NULL,
	`number` integer NOT NULL,
	`origin_chamber` text,
	`title` text NOT NULL,
	`latest_action_date` text,
	`latest_action_text` text,
	`stage` text NOT NULL,
	`update_date` text,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bill_index_congress_idx` ON `official_bill_index` (`congress`,`stage`);--> statement-breakpoint
CREATE INDEX `bill_index_type_idx` ON `official_bill_index` (`congress`,`bill_type`);--> statement-breakpoint
CREATE TABLE `official_leaders` (
	`politician_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`chamber` text NOT NULL,
	`start` text,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`politician_id`, `title`)
);
--> statement-breakpoint
CREATE TABLE `tx_session_stats` (
	`session` text PRIMARY KEY NOT NULL,
	`counts` text NOT NULL,
	`source` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
