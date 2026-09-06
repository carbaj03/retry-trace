CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort` text NOT NULL,
	`discovery` text NOT NULL,
	`directed` integer,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`run` text NOT NULL,
	`sequence` integer NOT NULL,
	`received` text NOT NULL,
	`status` integer NOT NULL,
	`retry_after` text,
	FOREIGN KEY (`run`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_sequence` ON `attempts` (`run`,`sequence`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`cohort` text NOT NULL,
	`entity` text,
	`referral` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_at` ON `events` (`at`);--> statement-breakpoint
CREATE INDEX `events_cohort_kind` ON `events` (`cohort`,`kind`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`cohort` text NOT NULL,
	`parent` text,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text NOT NULL,
	`client_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`actor`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finding_actor_key` ON `findings` (`actor`,`client_key`);--> statement-breakpoint
CREATE INDEX `finding_cohort_created` ON `findings` (`cohort`,`created`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`cohort` text NOT NULL,
	`status` integer NOT NULL,
	`failures` integer NOT NULL,
	`delay` integer NOT NULL,
	`format` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	FOREIGN KEY (`actor`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_created` ON `runs` (`created`);--> statement-breakpoint
CREATE INDEX `runs_actor` ON `runs` (`actor`);