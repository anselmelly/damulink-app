CREATE TABLE `donor_prefs` (
	`user_id` varchar(26) NOT NULL,
	`sms_alerts` boolean NOT NULL,
	`email_alerts` boolean NOT NULL DEFAULT false,
	`available` boolean NOT NULL DEFAULT true,
	`paused_until` datetime(3),
	`weekly_cap` int,
	`quiet_from` int,
	`quiet_to` int,
	`reminder_cycle` enum('on_day','days_before','custom','off') NOT NULL DEFAULT 'on_day',
	`reminder_days_before` int NOT NULL DEFAULT 3,
	`reminder_cycle_months` int,
	`appointment_reminders` boolean NOT NULL DEFAULT true,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `donor_prefs_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `facility_requests` ADD `town` varchar(80);--> statement-breakpoint
ALTER TABLE `facility_requests` ADD `county` varchar(80);