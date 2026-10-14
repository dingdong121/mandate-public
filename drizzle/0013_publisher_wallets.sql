CREATE TABLE `bounty_client_wallets` (
	`bounty_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chain_id` integer NOT NULL,
	`agent_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `bounties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
