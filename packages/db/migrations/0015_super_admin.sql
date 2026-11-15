CREATE TABLE `user_flags` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`kind` enum('rejected_requests','no_shows') NOT NULL,
	`reason` varchar(200) NOT NULL,
	`evidence` json NOT NULL,
	`status` enum('open','dismissed','actioned') NOT NULL DEFAULT 'open',
	`open_key` varchar(60),
	`note` varchar(300),
	`created_at` datetime(3) NOT NULL,
	`resolved_at` datetime(3),
	`resolved_by` varchar(26),
	CONSTRAINT `user_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_flags_open_uq` UNIQUE(`open_key`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `admin_added_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `admin_added_by` varchar(26);--> statement-breakpoint
CREATE INDEX `user_flags_status_idx` ON `user_flags` (`status`,`created_at`);