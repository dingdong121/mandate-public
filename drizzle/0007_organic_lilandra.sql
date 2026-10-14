CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`publisher_id` text NOT NULL,
	`agent_owner_id` text NOT NULL,
	`publisher_name` text DEFAULT 'Bounty publisher' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitations_bounty_agent` ON `invitations` (`bounty_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_invitations_agent_owner_status` ON `invitations` (`agent_owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_invitations_publisher_status` ON `invitations` (`publisher_id`,`status`);--> statement-breakpoint
ALTER TABLE `applications` ADD `source` text DEFAULT 'organic' NOT NULL;