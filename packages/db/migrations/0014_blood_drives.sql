CREATE TABLE `drive_alerts` (
	`id` varchar(26) NOT NULL,
	`drive_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`status` enum('reserved','sent','failed') NOT NULL,
	`error` varchar(200),
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `drive_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `drive_alerts_user_uq` UNIQUE(`drive_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `drive_interest` (
	`id` varchar(26) NOT NULL,
	`drive_id` varchar(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(16),
	`user_id` varchar(26),
	`arrived_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `drive_interest_id` PRIMARY KEY(`id`),
	CONSTRAINT `drive_interest_user_uq` UNIQUE(`drive_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `drives` (
	`id` varchar(26) NOT NULL,
	`number` int NOT NULL,
	`short` varchar(8) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`host` varchar(120) NOT NULL,
	`venue` varchar(160) NOT NULL,
	`town` varchar(80) NOT NULL,
	`date` date NOT NULL,
	`starts` varchar(5) NOT NULL,
	`ends` varchar(5) NOT NULL,
	`public_text` varchar(200) NOT NULL,
	`target` int,
	`contact_name` varchar(100),
	`contact_phone` varchar(16),
	`is_public` boolean NOT NULL DEFAULT false,
	`sms_enabled` boolean NOT NULL DEFAULT false,
	`status` enum('draft','published','closed','cancelled','taken_down') NOT NULL,
	`published_at` datetime(3),
	`closed_at` datetime(3),
	`cancelled_at` datetime(3),
	`interest_total` int,
	`interest_came` int,
	`created_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `drives_id` PRIMARY KEY(`id`),
	CONSTRAINT `drives_number_uq` UNIQUE(`number`),
	CONSTRAINT `drives_short_uq` UNIQUE(`short`)
);
--> statement-breakpoint
ALTER TABLE `visits` ADD `drive_id` varchar(26);--> statement-breakpoint
ALTER TABLE `walkin_visits` ADD `drive_id` varchar(26);--> statement-breakpoint
CREATE INDEX `drive_interest_drive_idx` ON `drive_interest` (`drive_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `drives_facility_idx` ON `drives` (`facility_id`,`date`);--> statement-breakpoint
CREATE INDEX `drives_public_idx` ON `drives` (`status`,`date`);