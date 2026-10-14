CREATE TABLE IF NOT EXISTS mainnet_beta_gas_reservations (
 bounty_id TEXT NOT NULL, stage TEXT NOT NULL,
 operation_id TEXT NOT NULL UNIQUE,
 reserved_micros INTEGER NOT NULL CHECK(reserved_micros=25000),
 PRIMARY KEY(bounty_id,stage)
);
CREATE TRIGGER IF NOT EXISTS mainnet_beta_gas_cap BEFORE INSERT ON mainnet_beta_gas_reservations
WHEN NOT EXISTS(SELECT 1 FROM mainnet_beta_gas_reservations WHERE bounty_id=NEW.bounty_id AND stage=NEW.stage)
AND (SELECT coalesce(sum(reserved_micros),0) FROM mainnet_beta_gas_reservations WHERE bounty_id=NEW.bounty_id)+NEW.reserved_micros>200000
BEGIN SELECT RAISE(ABORT,'mainnet_beta_gas_budget_exhausted'); END;
