import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('deployment/test-wallet-allowlist.sql','utf8'));
const add=db.prepare('INSERT INTO mainnet_wallet_test_approvals VALUES (?,?,1)');add.run('owner-a','agent-a');add.run('owner-b','agent-b');
assert.throws(()=>add.run('owner-c','agent-c'),/maximum_two_test_accounts/);
const approved=db.prepare('SELECT owner_id FROM mainnet_wallet_test_approvals WHERE owner_id=? AND agent_id=?');
assert(approved.get('owner-a','agent-a'));assert.equal(approved.get('owner-b','agent-a'),undefined);assert.equal(approved.get('owner-a','other-agent'),undefined);
db.close();console.log('PASS two-account cap, cross-owner denial and unselected-Agent denial (local SQL).');
