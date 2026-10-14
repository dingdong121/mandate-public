import assert from 'node:assert/strict';
import {env,state,sqlite,route,seed,call,row,contract} from './route-harness.mjs';
seed('crash');env.CHAIN_WRITES_ENABLED='testnet-approved';
sqlite.prepare("UPDATE bounties SET status='funded',funding_stage='funded',contract_address=?,onchain_job_id='1' WHERE id='crash'").run(contract);
const settle=await route('app/api/bounties/[id]/settle/route.ts');
const body={action:'submit',deliverable:'Exact original crash-window delivery'};
state.throwAfterSend=true;
assert.equal((await call(settle,'crash','POST',body,'B')).status,503);
const original=sqlite.prepare("SELECT * FROM financial_operations WHERE resource='bounty:crash'").get();
assert.equal(original.status,'uncertain');assert.equal(original.transaction_id,null);
assert.equal(state.sends,1);assert.equal(row('crash').settlement_transaction_id,null);
assert.equal((await call(settle,'crash','POST',{...body,deliverable:'Changed content must be refused'},'B')).status,409);
state.throwAfterSend=false;
const recovered=await Promise.all(Array.from({length:8},()=>call(settle,'crash','POST',body,'B')));
assert.equal(recovered.filter(r=>r.status===202).length,1);
assert.equal(state.sends,1); // provider exactly-once mock accepted only one send
assert.equal(state.providerRequests.length,2);
assert.equal(state.providerRequests[0].idempotencyKey,state.providerRequests[1].idempotencyKey);
assert.equal(row('crash').settlement_transaction_id,'tx-1');
// A true process death leaves claimed (catch never ran). It must NOT auto-unlock.
seed('hard-crash');sqlite.prepare("UPDATE bounties SET status='funded',funding_stage='funded',contract_address=?,onchain_job_id='2' WHERE id='hard-crash'").run(contract);
sqlite.prepare("INSERT INTO financial_operations(id,owner_id,chain_id,resource,action,request_key,payload_hash,circle_key,status,created_at) VALUES ('hard','B',5042002,'bounty:hard-crash','submit_pending','hard-request','unknown-hash','retained-key','claimed','2020-01-01')").run();
assert.equal((await call(settle,'hard-crash','POST',body,'B')).status,409);
assert.equal(state.sends,1);assert.equal(sqlite.prepare("SELECT status FROM financial_operations WHERE id='hard'").get().status,'claimed');
console.log('PASS response-loss same-key recovery / 8 concurrent retry clicks / changed payload denied / hard-crash stale lock retained. MOCK provider, NOT live Circle outage. Hard crash requires manual evidence reconciliation.');sqlite.close();
