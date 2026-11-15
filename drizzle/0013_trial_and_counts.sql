CREATE TABLE `beta_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`last_active_day` text,
	`active_days` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_invites_number_uq` ON `beta_invites` (`number`);--> statement-breakpoint
CREATE TABLE `event_counts` (
	`day` text NOT NULL,
	`name` text NOT NULL,
	`dim` text DEFAULT '' NOT NULL,
	`n` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `name`, `dim`)
);
