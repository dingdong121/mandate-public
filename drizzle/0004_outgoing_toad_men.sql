ALTER TABLE `bounties` ADD `deliverable` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `deliverable_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `settlement_stage` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `bounties` ADD `settlement_transaction_id` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `settlement_idempotency_key` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `settlement_error` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `submit_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `complete_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `reject_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `refund_tx_hash` text;