CREATE TABLE IF NOT EXISTS mainnet_test_gas_reservations (
 bounty_id TEXT NOT NULL, stage TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE,
 reserved_micros INTEGER NOT NULL CHECK(reserved_micros=30000),
 PRIMARY KEY(bounty_id,stage)
);
CREATE TRIGGER IF NOT EXISTS mainnet_test_gas_cap BEFORE INSERT ON mainnet_test_gas_reservations
WHEN NOT EXISTS(SELECT 1 FROM mainnet_test_gas_reservations WHERE bounty_id=NEW.bounty_id AND stage=NEW.stage)
AND (SELECT coalesce(sum(reserved_micros),0) FROM mainnet_test_gas_reservations WHERE bounty_id=NEW.bounty_id)+NEW.reserved_micros>180000
BEGIN SELECT RAISE(ABORT,'mainnet_test_gas_budget_exhausted'); END;
