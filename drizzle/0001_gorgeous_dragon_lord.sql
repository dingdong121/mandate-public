CREATE TABLE `contract_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text DEFAULT 'bounty_escrow' NOT NULL,
	`circle_contract_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`contract_address` text,
	`tx_hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`failure_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_deployments_owner_kind` ON `contract_deployments` (`owner_id`,`kind`);