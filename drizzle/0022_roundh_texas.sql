CREATE TABLE `tx_bill_actions` (
	`bill_id` text NOT NULL,
	`seq` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`chamber` text,
	`classification` text,
	PRIMARY KEY(`bill_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `tx_bill_actions_date_idx` ON `tx_bill_actions` (`date`);--> statement-breakpoint
CREATE TABLE `tx_bill_sponsors` (
	`bill_id` text NOT NULL,
	`name` text NOT NULL,
	`person_id` text,
	`primary` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`bill_id`, `name`)
);
--> statement-breakpoint
CREATE INDEX `tx_bill_sponsors_person_idx` ON `tx_bill_sponsors` (`person_id`);--> statement-breakpoint
CREATE TABLE `tx_bill_versions` (
	`bill_id` text NOT NULL,
	`note` text NOT NULL,
	`date` text,
	`url` text,
	PRIMARY KEY(`bill_id`, `note`)
);
--> statement-breakpoint
CREATE TABLE `tx_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`openstates_id` text,
	`session` text NOT NULL,
	`identifier` text NOT NULL,
	`title` text NOT NULL,
	`chamber` text,
	`classification` text,
	`subjects` text,
	`stage` text NOT NULL,
	`first_action_date` text,
	`latest_action_date` text,
	`latest_action_description` text,
	`tlo_url` text NOT NULL,
	`openstates_url` text,
	`feed` text NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tx_bills_session_idx` ON `tx_bills` (`session`,`latest_action_date`);--> statement-breakpoint
CREATE INDEX `tx_bills_stage_idx` ON `tx_bills` (`session`,`stage`);--> statement-breakpoint
CREATE TABLE `tx_committee_members` (
	`committee_id` text NOT NULL,
	`name` text NOT NULL,
	`person_id` text,
	`role` text NOT NULL,
	PRIMARY KEY(`committee_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `tx_committees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`chamber` text,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tx_events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start` text NOT NULL,
	`location` text,
	`classification` text,
	`bills` text,
	`url` text,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tx_events_start_idx` ON `tx_events` (`start`);--> statement-breakpoint
CREATE TABLE `tx_member_votes` (
	`vote_id` text NOT NULL,
	`person_id` text,
	`name` text NOT NULL,
	`option` text NOT NULL,
	PRIMARY KEY(`vote_id`, `name`)
);
--> statement-breakpoint
CREATE INDEX `tx_member_votes_person_idx` ON `tx_member_votes` (`person_id`);--> statement-breakpoint
CREATE TABLE `tx_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`party` text NOT NULL,
	`chamber` text NOT NULL,
	`district` text NOT NULL,
	`title` text,
	`image` text,
	`url` text,
	`is_current` integer DEFAULT 1 NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tx_people_district_idx` ON `tx_people` (`chamber`,`district`);--> statement-breakpoint
CREATE TABLE `tx_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`motion` text NOT NULL,
	`date` text NOT NULL,
	`result` text NOT NULL,
	`chamber` text,
	`counts` text,
	`tally_ok` integer DEFAULT 1 NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tx_votes_bill_idx` ON `tx_votes` (`bill_id`);--> statement-breakpoint
CREATE INDEX `tx_votes_date_idx` ON `tx_votes` (`date`);