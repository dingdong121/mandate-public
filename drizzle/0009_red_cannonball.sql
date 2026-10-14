CREATE TABLE `agent_wallet_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`wallet_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_wallet_chain` ON `agent_wallet_bindings` (`agent_id`,`chain_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_network_id` ON `agent_wallet_bindings` (`wallet_id`,`chain_id`);--> statement-breakpoint
CREATE TABLE `financial_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`circle_key` text NOT NULL,
	`transaction_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operation_request` ON `financial_operations` (`owner_id`,`chain_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operation_active_resource` ON `financial_operations` (`chain_id`,`resource`) WHERE "financial_operations"."status" IN ('claimed', 'submitted', 'uncertain');--> statement-breakpoint
DROP INDEX `idx_contract_deployments_owner_kind`;--> statement-breakpoint
ALTER TABLE `contract_deployments` ADD `chain_id` integer DEFAULT 5042002 NOT NULL;--> statement-breakpoint
ALTER TABLE `contract_deployments` ADD `contract_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_deployments_owner_kind_chain` ON `contract_deployments` (`owner_id`,`kind`,`chain_id`);