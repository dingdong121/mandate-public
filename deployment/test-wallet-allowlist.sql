-- Approval is attached to an actual verified user ID, never a frontend email.
CREATE TABLE IF NOT EXISTS mainnet_wallet_test_approvals (
 owner_id TEXT PRIMARY KEY,
 agent_id TEXT NOT NULL UNIQUE,
 approved_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS mainnet_wallet_test_max_two BEFORE INSERT ON mainnet_wallet_test_approvals
WHEN (SELECT count(*) FROM mainnet_wallet_test_approvals)>=2
BEGIN SELECT RAISE(ABORT,'maximum_two_test_accounts'); END;
