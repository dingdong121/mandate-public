CREATE TABLE `funding_sessions` (
	`chain_id` integer NOT NULL,
	`wallet_id` text NOT NULL,
	`bounty_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_funding_signer_network` ON `funding_sessions` (`chain_id`,`wallet_id`);