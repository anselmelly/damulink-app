CREATE TABLE `donations` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`donated_on` date NOT NULL,
	`weight_kg` decimal(4,1),
	`bag_number` varchar(40),
	`call_id` varchar(26),
	`recorded_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `donations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lab_samples` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`source` enum('donation','test') NOT NULL,
	`donation_id` varchar(26),
	`sample_ref` varchar(40) NOT NULL,
	`status` enum('pending','resulted') NOT NULL DEFAULT 'pending',
	`created_at` datetime(3) NOT NULL,
	`resulted_at` datetime(3),
	`resulted_by` varchar(26),
	CONSTRAINT `lab_samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`kind` enum('donated','test','deferred','no_show') NOT NULL,
	`donation_id` varchar(26),
	`call_id` varchar(26),
	`appointment_id` varchar(26),
	`return_after` date,
	`recorded_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `walkin_visits` (
	`id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`sex` enum('female','male') NOT NULL,
	`date_of_birth` date NOT NULL,
	`weight_kg` decimal(4,1),
	`blood_type` enum('O-','O+','A-','A+','B-','B+','AB-','AB+'),
	`outcome` enum('donated','test','deferred') NOT NULL,
	`bag_number` varchar(40),
	`invite_phone` varchar(16),
	`recorded_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `walkin_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `donations_user_idx` ON `donations` (`user_id`,`donated_on`);--> statement-breakpoint
CREATE INDEX `donations_facility_idx` ON `donations` (`facility_id`,`donated_on`);--> statement-breakpoint
CREATE INDEX `lab_samples_facility_idx` ON `lab_samples` (`facility_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `lab_samples_user_idx` ON `lab_samples` (`user_id`);--> statement-breakpoint
CREATE INDEX `visits_facility_idx` ON `visits` (`facility_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `visits_user_idx` ON `visits` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `walkin_visits_facility_idx` ON `walkin_visits` (`facility_id`,`created_at`);