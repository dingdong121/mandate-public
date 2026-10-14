CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`wallet_provider` text DEFAULT 'mock' NOT NULL,
	`wallet_id` text,
	`wallet_address` text,
	`chain_id` integer DEFAULT 5042002 NOT NULL,
	`erc8004_agent_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_owner_created` ON `agents` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `allowed_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`address` text NOT NULL,
	`service_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipient_agent_address` ON `allowed_recipients` (`agent_id`,`address`);--> statement-breakpoint
CREATE TABLE `bounties` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider_agent_id` text,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`reward_micros` integer NOT NULL,
	`tool_budget_micros` integer DEFAULT 0 NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`chain_id` integer DEFAULT 5042002 NOT NULL,
	`contract_address` text,
	`onchain_job_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bounties_owner_status` ON `bounties` (`owner_id`,`status`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`agent_id` text,
	`bounty_id` text,
	`kind` text NOT NULL,
	`amount_micros` integer NOT NULL,
	`recipient_address` text,
	`purpose` text NOT NULL,
	`policy_decision` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`tx_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ledger_idempotency` ON `ledger_entries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_ledger_owner_created` ON `ledger_entries` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`daily_limit_micros` integer NOT NULL,
	`transaction_limit_micros` integer NOT NULL,
	`spent_today_micros` integer DEFAULT 0 NOT NULL,
	`day_index` integer NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_policies_agent` ON `policies` (`agent_id`);
--> statement-breakpoint
PRAGMA optimize;
