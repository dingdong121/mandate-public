ALTER TABLE `bounties` ADD `funding_stage` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `bounties` ADD `current_transaction_id` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `create_job_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `set_budget_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `approve_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `fund_tx_hash` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `funding_error` text;--> statement-breakpoint
ALTER TABLE `bounties` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;