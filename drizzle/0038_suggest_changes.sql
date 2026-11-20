CREATE TABLE `bill_text_sections` (
	`bill_key` text NOT NULL,
	`system` text NOT NULL,
	`version` text NOT NULL,
	`version_label` text NOT NULL,
	`version_date` text,
	`seq` integer NOT NULL,
	`num` text NOT NULL,
	`heading` text NOT NULL,
	`body` text NOT NULL,
	`source_url` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	PRIMARY KEY(`bill_key`, `version`, `seq`),
	CONSTRAINT "bill_text_sections_system" CHECK("bill_text_sections"."system" IN ('federal', 'texas'))
);
--> statement-breakpoint
CREATE INDEX `bill_text_sections_bill_idx` ON `bill_text_sections` (`bill_key`,`version`);--> statement-breakpoint
CREATE TABLE `change_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_key` text NOT NULL,
	`system` text NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`generator` text NOT NULL,
	`model` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`notes` text NOT NULL,
	`window_at_draft` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	CONSTRAINT "change_menus_status" CHECK("change_menus"."status" IN ('review', 'live', 'closed', 'failed')),
	CONSTRAINT "change_menus_system" CHECK("change_menus"."system" IN ('federal', 'texas'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `change_menus_bill_version_uq` ON `change_menus` (`bill_key`,`version`);--> statement-breakpoint
CREATE INDEX `change_menus_status_idx` ON `change_menus` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `change_options` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`bill_key` text NOT NULL,
	`seq` integer NOT NULL,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`source_label` text NOT NULL,
	`section_version` text NOT NULL,
	`section_num` text NOT NULL,
	`quote` text NOT NULL,
	`other_quote` text,
	`group_key` text NOT NULL,
	`kind` text NOT NULL,
	`about` text NOT NULL,
	`direction` text NOT NULL,
	`wording` text NOT NULL,
	`checks` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`editor_note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`menu_id`) REFERENCES `change_menus`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "change_options_source" CHECK("change_options"."source" IN ('amendment', 'version', 'dial')),
	CONSTRAINT "change_options_direction" CHECK("change_options"."direction" IN ('up', 'down', 'keep', 'remove', 'adopt', 'reject', 'this_version', 'other_version')),
	CONSTRAINT "change_options_status" CHECK("change_options"."status" IN ('draft', 'approved', 'rejected', 'retired'))
);
--> statement-breakpoint
CREATE INDEX `change_options_menu_idx` ON `change_options` (`menu_id`,`seq`);--> statement-breakpoint
CREATE INDEX `change_options_bill_idx` ON `change_options` (`bill_key`,`status`);