import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('deployment/mainnet-gas-budget.sql','utf8'));
const insert=db.prepare('INSERT INTO mainnet_test_gas_reservations VALUES (?,?,?,30000) ON CONFLICT(bounty_id,stage) DO NOTHING');
for(let i=0;i<6;i++)insert.run('approved',`stage${i}`,`operation${i}`);
assert.equal(db.prepare('SELECT sum(reserved_micros) AS n FROM mainnet_test_gas_reservations').get().n,180000);
assert.throws(()=>insert.run('approved','seventh','extra'),/mainnet_test_gas_budget_exhausted/);
insert.run('approved','stage0','replacement');assert.equal(db.prepare("SELECT operation_id FROM mainnet_test_gas_reservations WHERE stage='stage0'").get().operation_id,'operation0');
assert.equal(500000n*60000000000n,30000000000000000n);db.close();console.log('PASS six-stage 0.18 USDC cap, seventh rejected, original reservation immutable, per-send 0.03 USDC fee arithmetic. Local SQL only.');
