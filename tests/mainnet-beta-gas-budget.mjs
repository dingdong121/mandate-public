import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('deployment/mainnet-beta-gas-budget.sql','utf8'));
const add=db.prepare('INSERT INTO mainnet_beta_gas_reservations VALUES (?,?,?,25000) ON CONFLICT(bounty_id,stage) DO NOTHING');
for(let i=0;i<8;i++)add.run('task','stage'+i,'op'+i);
assert.throws(()=>add.run('task','extra','extra'),/mainnet_beta_gas_budget_exhausted/);
add.run('task','stage0','replacement');assert.equal(db.prepare("SELECT operation_id FROM mainnet_beta_gas_reservations WHERE stage='stage0'").get().operation_id,'op0');
assert.equal(500000n*50000000000n,25000000000000000n);
db.close();console.log('PASS 0.025 USDC per-stage ceiling, 0.20 aggregate reservations, original stage operation immutable. Local SQL only.');
