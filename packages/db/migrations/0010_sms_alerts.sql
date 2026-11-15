CREATE TABLE `call_alerts` (
	`id` varchar(26) NOT NULL,
	`call_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`ring` int NOT NULL,
	`status` enum('reserved','sent','failed') NOT NULL,
	`error` varchar(200),
	`created_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	CONSTRAINT `call_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `call_alerts_donor_uq` UNIQUE(`call_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `calls` ADD `ring_sent` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `call_alerts_user_idx` ON `call_alerts` (`user_id`,`sent_at`);