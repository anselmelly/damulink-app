CREATE TABLE `facility_invites` (
	`id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	`email` varchar(254) NOT NULL,
	`role` enum('admin','attendant') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`invited_by` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`accepted_at` datetime(3),
	`revoked_at` datetime(3),
	CONSTRAINT `facility_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `facility_invites_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `sex` enum('female','male');--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `date_of_birth` date;--> statement-breakpoint
ALTER TABLE `facilities` ADD `slug` varchar(80);--> statement-breakpoint
ALTER TABLE `facilities` ADD CONSTRAINT `facilities_slug_uq` UNIQUE(`slug`);--> statement-breakpoint
CREATE INDEX `facility_invites_facility_idx` ON `facility_invites` (`facility_id`,`email`);