CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	`detail` text NOT NULL,
	`recipient` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alert_events_kind_sent_idx` ON `alert_events` (`kind`,`sent_at`);