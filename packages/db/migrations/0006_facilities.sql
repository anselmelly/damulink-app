CREATE TABLE `facility_events` (
	`id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`actor_id` varchar(26),
	`kind` enum('submitted','resubmitted','ask','reply','approve','reject','suspend','reactivate','note') NOT NULL,
	`how` varchar(80),
	`text` text,
	`visible` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `facility_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facility_members` (
	`facility_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`role` enum('admin','attendant') NOT NULL,
	`role_title` varchar(80),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `facility_members_uq` UNIQUE(`facility_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `facilities` MODIFY COLUMN `status` enum('incomplete','pending','needs_info','verified','rejected','suspended') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `facilities` ADD `license_number` varchar(60);--> statement-breakpoint
ALTER TABLE `facilities` ADD `owner` varchar(150);--> statement-breakpoint
ALTER TABLE `facilities` ADD `address` varchar(200);--> statement-breakpoint
ALTER TABLE `facilities` ADD `lat` decimal(9,6);--> statement-breakpoint
ALTER TABLE `facilities` ADD `lng` decimal(9,6);--> statement-breakpoint
ALTER TABLE `facilities` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `facilities` ADD `email` varchar(254);--> statement-breakpoint
ALTER TABLE `facilities` ADD `facility_code` varchar(12);--> statement-breakpoint
ALTER TABLE `facilities` ADD `created_by` varchar(26);--> statement-breakpoint
ALTER TABLE `facilities` ADD `submitted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `facilities` ADD `verified_at` datetime(3);--> statement-breakpoint
ALTER TABLE `facilities` ADD CONSTRAINT `facilities_code_uq` UNIQUE(`facility_code`);--> statement-breakpoint
CREATE INDEX `facility_events_facility_idx` ON `facility_events` (`facility_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `facility_members_user_idx` ON `facility_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `facilities_license_idx` ON `facilities` (`license_number`);--> statement-breakpoint
CREATE INDEX `facilities_status_idx` ON `facilities` (`status`,`submitted_at`);