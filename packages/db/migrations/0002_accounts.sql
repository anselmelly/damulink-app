CREATE TABLE `facilities` (
	`id` varchar(26) NOT NULL,
	`name` varchar(150) NOT NULL,
	`type` varchar(40) NOT NULL,
	`town` varchar(80) NOT NULL,
	`county` varchar(80) NOT NULL,
	`status` enum('pending','verified','suspended') NOT NULL DEFAULT 'pending',
	CONSTRAINT `facilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facility_requests` (
	`id` varchar(26) NOT NULL,
	`name` varchar(150) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `facility_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` varchar(190) NOT NULL,
	`window_start` datetime(3) NOT NULL,
	`count` int NOT NULL,
	CONSTRAINT `rate_limits_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`family_id` varchar(26) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`user_agent` varchar(255),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_extra_facilities` (
	`user_id` varchar(26) NOT NULL,
	`facility_id` varchar(26) NOT NULL,
	CONSTRAINT `user_extra_facilities_uq` UNIQUE(`user_id`,`facility_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(26) NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified_at` datetime(3),
	`phone` varchar(16) NOT NULL,
	`phone_verified_at` datetime(3),
	`password_hash` varchar(255) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`token_version` int NOT NULL DEFAULT 0,
	`is_super_admin` boolean NOT NULL DEFAULT false,
	`sex` enum('female','male') NOT NULL,
	`date_of_birth` date NOT NULL,
	`donor_code` varchar(12),
	`home_facility_id` varchar(26),
	`unlisted_facility_name` varchar(150),
	`sms_opt_in` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`last_login_at` datetime(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`),
	CONSTRAINT `users_phone_uq` UNIQUE(`phone`),
	CONSTRAINT `users_donor_code_uq` UNIQUE(`donor_code`)
);
--> statement-breakpoint
CREATE INDEX `facilities_name_idx` ON `facilities` (`name`);--> statement-breakpoint
CREATE INDEX `facilities_town_idx` ON `facilities` (`town`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);