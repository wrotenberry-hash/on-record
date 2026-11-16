CREATE TABLE `analysis_version_changes` (
	`bill_id` text NOT NULL,
	`from_type` text NOT NULL,
	`to_type` text NOT NULL,
	`added` text,
	`removed` text,
	`changed` text,
	`bullets` text,
	`status` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `from_type`, `to_type`)
);
--> statement-breakpoint
CREATE TABLE `official_amendments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`chamber` text NOT NULL,
	`number` integer NOT NULL,
	`description` text,
	`purpose` text,
	`latest_action_date` text,
	`latest_action_text` text,
	`outcome` text NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `amendments_bill_idx` ON `official_amendments` (`bill_id`);--> statement-breakpoint
CREATE TABLE `official_bill_actions` (
	`bill_id` text NOT NULL,
	`seq` integer NOT NULL,
	`action_date` text NOT NULL,
	`text` text NOT NULL,
	`type` text,
	`action_code` text,
	`chamber` text,
	`stage` text,
	`committees` text,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `bill_actions_date_idx` ON `official_bill_actions` (`action_date`);--> statement-breakpoint
CREATE INDEX `bill_actions_stage_idx` ON `official_bill_actions` (`stage`);--> statement-breakpoint
CREATE TABLE `official_bill_committees` (
	`bill_id` text NOT NULL,
	`committee_id` text NOT NULL,
	`referred_at` text,
	`reported_at` text,
	PRIMARY KEY(`bill_id`, `committee_id`)
);
--> statement-breakpoint
CREATE INDEX `bill_committees_committee_idx` ON `official_bill_committees` (`committee_id`);--> statement-breakpoint
CREATE TABLE `official_bill_depth` (
	`bill_id` text PRIMARY KEY NOT NULL,
	`latest_action_at` text,
	`stage` text,
	`stage_date` text,
	`actions_at` integer,
	`amendments_at` integer,
	`texts_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `official_bill_texts` (
	`bill_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text,
	`xml_url` text,
	`html_url` text,
	`pdf_url` text,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`bill_id`, `type`)
);
--> statement-breakpoint
CREATE TABLE `official_committee_members` (
	`committee_id` text NOT NULL,
	`politician_id` text NOT NULL,
	`side` text,
	`rank` integer,
	`title` text,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`committee_id`, `politician_id`)
);
--> statement-breakpoint
CREATE INDEX `committee_members_politician_idx` ON `official_committee_members` (`politician_id`);--> statement-breakpoint
CREATE TABLE `official_committees` (
	`id` text PRIMARY KEY NOT NULL,
	`chamber` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`url` text,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `official_floor_schedule` (
	`chamber` text NOT NULL,
	`week_of` text NOT NULL,
	`label` text NOT NULL,
	`bill_id` text,
	`description` text,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`chamber`, `week_of`, `label`)
);
--> statement-breakpoint
CREATE INDEX `floor_schedule_bill_idx` ON `official_floor_schedule` (`bill_id`);--> statement-breakpoint
CREATE TABLE `official_tally_checks` (
	`roll_call_id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	`detail` text,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tally_checks_ok_idx` ON `official_tally_checks` (`ok`);