ALTER TABLE `donation_requests` ADD `cancelled_by` enum('donor','facility');--> statement-breakpoint
ALTER TABLE `donation_requests` ADD `cancel_reason` varchar(20);--> statement-breakpoint
ALTER TABLE `donation_requests` ADD `cancel_note` varchar(200);--> statement-breakpoint
ALTER TABLE `donation_requests` ADD `reschedule_asked` boolean DEFAULT false NOT NULL;