CREATE TABLE `post_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`image_path` text NOT NULL,
	`link` text NOT NULL,
	`caption` text NOT NULL,
	`official_only` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`posted_to` text,
	`error` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`posted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_queue_day_subject_idx` ON `post_queue` (`day`,`kind`,`subject`);--> statement-breakpoint
CREATE INDEX `post_queue_status_idx` ON `post_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `problem_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_ref` text NOT NULL,
	`page` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `problem_reports_status_idx` ON `problem_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`code` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`signups` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_target_idx` ON `share_links` (`target`);