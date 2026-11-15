CREATE TABLE `call_responses` (
	`id` varchar(26) NOT NULL,
	`call_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`ring` int NOT NULL,
	`status` enum('willing','scheduled','donated','not_needed') NOT NULL,
	`replied_at` datetime(3) NOT NULL,
	`scheduled_at` datetime(3),
	`donation_id` varchar(26),
	CONSTRAINT `call_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `call_responses_donor_uq` UNIQUE(`call_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` varchar(26) NOT NULL,
	`number` int NOT NULL,
	`short` varchar(8) NOT NULL,
	`request_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`blood_type` varchar(4) NOT NULL,
	`types` json NOT NULL,
	`urgency` enum('normal','urgent','surge') NOT NULL,
	`public_text` varchar(500) NOT NULL,
	`is_public` boolean NOT NULL,
	`sms_enabled` boolean NOT NULL DEFAULT false,
	`status` enum('live','closed','expired','taken_down') NOT NULL,
	`units_needed` int NOT NULL,
	`published_at` datetime(3) NOT NULL,
	`closes_at` datetime(3) NOT NULL,
	`extended_days` int NOT NULL DEFAULT 0,
	`closed_at` datetime(3),
	`close_reason` varchar(20),
	`created_by` varchar(26) NOT NULL,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`),
	CONSTRAINT `calls_number_uq` UNIQUE(`number`),
	CONSTRAINT `calls_short_uq` UNIQUE(`short`),
	CONSTRAINT `calls_request_uq` UNIQUE(`request_id`)
);
--> statement-breakpoint
ALTER TABLE `request_events` MODIFY COLUMN `kind` enum('sent','raised','confirmed','asked','replied','approved','rejected','cancelled','published','closed') NOT NULL;--> statement-breakpoint
CREATE INDEX `call_responses_call_idx` ON `call_responses` (`call_id`,`replied_at`);--> statement-breakpoint
CREATE INDEX `calls_facility_idx` ON `calls` (`facility_id`,`status`);--> statement-breakpoint
CREATE INDEX `calls_live_idx` ON `calls` (`status`,`closes_at`);