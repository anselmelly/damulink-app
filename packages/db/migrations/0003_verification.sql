CREATE TABLE `auth_tokens` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`kind` enum('verify_email','reset_password') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `phone_otps` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`phone` varchar(16) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `phone_otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `phone_otps_user_idx` ON `phone_otps` (`user_id`,`created_at`);