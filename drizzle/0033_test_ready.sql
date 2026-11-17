CREATE TABLE `error_events` (
	`day` text NOT NULL,
	`source` text NOT NULL,
	`route` text NOT NULL,
	`message` text NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`day`, `source`, `route`, `message`)
);
--> statement-breakpoint
CREATE TABLE `legislator_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`member_id` text NOT NULL,
	`phone` text,
	`contact_form_url` text,
	`office_address` text,
	`district_phone` text,
	`district_address` text,
	`email` text,
	`website_url` text,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legislator_contacts_member_idx` ON `legislator_contacts` (`kind`,`member_id`);--> statement-breakpoint
CREATE TABLE `official_committee_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`congress` integer NOT NULL,
	`chamber` text NOT NULL,
	`committee_code` text,
	`committee_name` text,
	`title` text NOT NULL,
	`meeting_type` text,
	`status` text,
	`starts_at` text NOT NULL,
	`location` text,
	`bill_ids` text,
	`url` text NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `official_committee_meetings_start_idx` ON `official_committee_meetings` (`starts_at`);--> statement-breakpoint
CREATE INDEX `official_committee_meetings_committee_idx` ON `official_committee_meetings` (`committee_code`);