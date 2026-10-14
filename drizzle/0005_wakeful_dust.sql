ALTER TABLE `agents` ADD `tagline` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `about` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `primary_category` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `tools` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `work_samples` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `availability` text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `minimum_bounty_micros` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `typical_delivery_time` text DEFAULT '' NOT NULL;