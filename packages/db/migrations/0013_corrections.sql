CREATE TABLE `record_corrections` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`field` enum('blood_type','weight','last_donation') NOT NULL,
	`old_value` varchar(20),
	`new_value` varchar(20) NOT NULL,
	`reason` enum('lab_differed','typo','wrong_donor','reweighed','other') NOT NULL,
	`note` varchar(200),
	`corrected_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `record_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `blood_type_facility_id` varchar(26);--> statement-breakpoint
ALTER TABLE `users` ADD `blood_type_at` datetime(3);--> statement-breakpoint
CREATE INDEX `record_corrections_donor_idx` ON `record_corrections` (`facility_id`,`user_id`,`created_at`);