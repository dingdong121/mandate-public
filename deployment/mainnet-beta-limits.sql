-- Reservations count attempts, including uncertain provider outcomes.
CREATE TABLE IF NOT EXISTS mainnet_beta_wallet_reservations (
 owner_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL UNIQUE,
 day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO mainnet_beta_wallet_reservations(owner_id,agent_id,day)
SELECT owner_id,agent_id,'existing' FROM agent_wallet_bindings WHERE chain_id=5042;
CREATE TRIGGER IF NOT EXISTS mainnet_beta_wallet_daily_cap
BEFORE INSERT ON mainnet_beta_wallet_reservations
WHEN NEW.day <> 'existing' AND
 (SELECT count(*) FROM mainnet_beta_wallet_reservations WHERE day=NEW.day)>=20
BEGIN SELECT RAISE(ABORT,'mainnet_beta_daily_wallet_cap'); END;
