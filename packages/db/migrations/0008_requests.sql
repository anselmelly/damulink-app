CREATE TABLE `blood_requests` (
	`id` varchar(26) NOT NULL,
	`number` int NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`requester_id` varchar(26),
	`raised_by` varchar(26),
	`source` enum('public','facility') NOT NULL,
	`patient_ref` varchar(120) NOT NULL,
	`patient_ref_key` varchar(120) NOT NULL,
	`patient_name` varchar(120),
	`relation` varchar(20),
	`blood_type_asked` varchar(8) NOT NULL,
	`units_asked` int NOT NULL,
	`needed_by` datetime(3) NOT NULL,
	`urgency_asked` enum('normal','urgent','surge') NOT NULL,
	`note` text,
	`internal_note` text,
	`status` enum('pending','needs_info','confirmed','approved','published','closed','rejected','cancelled') NOT NULL,
	`blood_type` varchar(4),
	`units` int,
	`urgency` enum('normal','urgent','surge'),
	`confirmed_by` varchar(26),
	`confirmed_at` datetime(3),
	`decided_by` varchar(26),
	`decided_at` datetime(3),
	`reject_reason` varchar(30),
	`reject_message` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `blood_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `blood_requests_number_uq` UNIQUE(`number`)
);
--> statement-breakpoint
CREATE TABLE `request_events` (
	`id` varchar(26) NOT NULL,
	`request_id` varchar(26) NOT NULL,
	`kind` enum('sent','raised','confirmed','asked','replied','approved','rejected','cancelled') NOT NULL,
	`actor_id` varchar(26),
	`note` text,
	`visible_to_requester` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `request_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `facility_members` ADD `can_approve` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `blood_requests_facility_idx` ON `blood_requests` (`facility_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `blood_requests_requester_idx` ON `blood_requests` (`requester_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `blood_requests_patient_idx` ON `blood_requests` (`facility_id`,`patient_ref_key`,`status`);--> statement-breakpoint
CREATE INDEX `request_events_request_idx` ON `request_events` (`request_id`,`created_at`);