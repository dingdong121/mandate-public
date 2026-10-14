CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`proposal` text NOT NULL,
	`expected_delivery_time` text NOT NULL,
	`proposed_amount_micros` integer NOT NULL,
	`work_sample_url` text,
	`status` text DEFAULT 'applied' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_applications_bounty_agent` ON `applications` (`bounty_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_applications_owner_created` ON `applications` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_applications_bounty_status` ON `applications` (`bounty_id`,`status`);--> statement-breakpoint
CREATE TABLE `bounty_events` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`tx_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bounty_events_bounty_created` ON `bounty_events` (`bounty_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `bounties` ADD `category` text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE `bounties` ADD `required_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `bounties` ADD `deliverables` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bounties` ADD `revision_note` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `result_url` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `delivery_summary` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `delivery_notes` text;