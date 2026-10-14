import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');const schema=fs.readFileSync('deployment/mainnet-recovery-drill.sql','utf8');db.exec(schema);
const consume=db.prepare('UPDATE mainnet_recovery_drills SET armed=0,consumed_operation_id=? WHERE bounty_id=? AND armed=1 AND consumed_operation_id IS NULL RETURNING bounty_id');const id='6085a20b-3758-4a4e-af9f-0b96876b00e9';
assert.equal(consume.get('wrong','ordinary-task'),undefined);assert(consume.get('original-op',id));assert.equal(consume.get('repeat',id),undefined);db.exec(schema);assert.equal(consume.get('after-reapply',id),undefined);
assert.equal(db.prepare('SELECT consumed_operation_id FROM mainnet_recovery_drills').get().consumed_operation_id,'original-op');db.close();console.log('PASS exact-task, atomic one-shot consumption, migration reapply does not rearm. Local SQL, no live send.');
