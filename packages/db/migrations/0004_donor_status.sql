CREATE TABLE `donation_requests` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`kind` enum('test','donate') NOT NULL,
	`days` varchar(27) NOT NULL,
	`time_of_day` enum('morning','afternoon','any') NOT NULL,
	`status` enum('requested','scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'requested',
	`scheduled_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `donation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `blood_type` enum('O-','O+','A-','A+','B-','B+','AB-','AB+');--> statement-breakpoint
ALTER TABLE `users` ADD `weight_kg` decimal(4,1);--> statement-breakpoint
ALTER TABLE `users` ADD `last_donation_on` date;--> statement-breakpoint
CREATE INDEX `donation_requests_user_idx` ON `donation_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `donation_requests_facility_idx` ON `donation_requests` (`facility_id`,`status`);