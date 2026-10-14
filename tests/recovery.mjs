import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Interface } from 'ethers';
import { recoveryPlan, rehearseRecovery, digest, localLockPlan, retireFundingSessionPlan } from '../scripts/recovery-plan.mjs';
import { fingerprint } from '../scripts/backup-invariants.mjs';
const db = new DatabaseSync(':memory:');
for (const f of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(`drizzle/${f}`, 'utf8'));
const c = '0x1111111111111111111111111111111111111111', provider = '0x2222222222222222222222222222222222222222', address = '0x3333333333333333333333333333333333333333';
db.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address) VALUES ('agent','B','synthetic','active','circle','wallet',?)").run(provider);
db.prepare("INSERT INTO bounties(id,owner_id,provider_agent_id,title,objective,acceptance_criteria,reward_micros,deadline) VALUES ('b','A','agent','synthetic','task','[]',100000,'2030-01-01')").run();
const agent = db.prepare("SELECT * FROM agents WHERE id='agent'").get(), bounty = () => db.prepare("SELECT * FROM bounties WHERE id='b'").get();
const deployment = { chain_id: 5042002, owner_id: 'A', status: 'complete', contract_address: address };
const payload = { walletId: 'treasury', target: address, signature: 'createJob(address,address,uint256,string,address)', parameters: [provider, c, '1893456000', 'task', '0x0000000000000000000000000000000000000000'] };
const op = { id: 'op', owner_id: 'A', chain_id: 5042002, resource: 'bounty:b', action: 'create_job_pending', circle_key: 'stable-key', payload_hash: digest({ resource: 'bounty:b', action: 'create_job_pending', payload }), status: 'uncertain', transaction_id: null };
function seedOperation() { db.prepare("INSERT INTO financial_operations(id,owner_id,chain_id,resource,action,request_key,payload_hash,circle_key,status,created_at) VALUES ('op','A',5042002,'bounty:b','create_job_pending','same-request',?,'stable-key','uncertain','2026-10-09')").run(op.payload_hash); }
seedOperation();
const hash = '0x' + '4'.repeat(64), blockHash = '0x' + '5'.repeat(64);
const evidence = { chainId: 5042002, payload, matchingCandidates: 1, signer: c, authorizedTreasuryAddress: c, canonicalBlockHash: blockHash, circle: { id: 'circle-tx', walletId: 'treasury', blockchain: 'ARC-TESTNET', state: 'COMPLETE', refId: 'mandate:5042002:b:create_job_pending:op', txHash: hash }, transaction: { hash, from: c, to: address, input: new Interface(['function ' + payload.signature]).encodeFunctionData(payload.signature, payload.parameters) }, receipt: { transactionHash: hash, from: c, to: address, blockHash, status: '0x1' } };
const context = () => ({ operation: op, bounty: bounty(), agent, deployment, evidence: structuredClone(evidence), operatorId: 'A' });
let checks = 0;
const check = (a,b) => { assert.deepEqual(a,b); checks++; };
const denied = fn => { assert.throws(fn); checks++; };
check(recoveryPlan({ ...context(), evidence: {} }).disposition, 'retain');
for (const mutate of [x=>x.operatorId='B', x=>x.operation={...op,chain_id:5042}, x=>x.evidence.chainId=5042, x=>x.evidence.matchingCandidates=2, x=>x.evidence.circle.walletId='foreign', x=>x.evidence.circle.state='STUCK', x=>x.evidence.transaction.input='0x00', x=>x.evidence.receipt.status='0x2', x=>x.evidence.canonicalBlockHash=hash, x=>x.deployment={...deployment,owner_id:'B'}, x=>x.evidence.payload.parameters[3]='different task']) { const x=context(); mutate(x); denied(()=>recoveryPlan(x)); }
const plan = recoveryPlan(context()); check(plan.sendsTransactions,false); check(plan.preservesFundingSession,true);
const before=fingerprint(db);
denied(()=>rehearseRecovery(db,plan,'wrong approval'));
check(fingerprint(db),before);
rehearseRecovery(db,plan,plan.approvalDigest);
check(bounty().current_transaction_id,'circle-tx');check(bounty().status,'draft');check(db.prepare("SELECT status FROM financial_operations WHERE id='op'").get().status,'submitted');
const after=fingerprint(db); denied(()=>rehearseRecovery(db,plan,plan.approvalDigest));check(fingerprint(db),after);
// Failed receipts permit recording a failure, never creating another send.
db.prepare("UPDATE financial_operations SET status='uncertain',transaction_id=NULL WHERE id='op'").run();
const fail=context();fail.evidence.receipt.status='0x0';fail.evidence.circle.state='FAILED';
const failedPlan=recoveryPlan(fail);check(failedPlan.disposition,'record-reverted');rehearseRecovery(db,failedPlan,failedPlan.approvalDigest);check(bounty().current_transaction_id,null);check(bounty().funding_stage,'draft');check(db.prepare("SELECT status FROM financial_operations WHERE id='op'").get().status,'failed');
// Simulated stale operation must roll back the first bounty update as well.
db.prepare("UPDATE financial_operations SET status='uncertain' WHERE id='op'").run();
const stale=context();stale.operation={...op,transaction_id:'circle-tx'};
const stalePlan=recoveryPlan(stale);db.prepare("UPDATE financial_operations SET status='complete' WHERE id='op'").run();
const staleBefore=fingerprint(db);denied(()=>rehearseRecovery(db,stalePlan,stalePlan.approvalDigest));check(fingerprint(db),staleBefore);
// A restore round-trip in memory preserves every row, not only the Paid fixture.
const restore = new DatabaseSync(':memory:');
for (const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) restore.exec(fs.readFileSync(`drizzle/${f}`,'utf8'));
for (const table of Object.keys(staleBefore.tables)) {
  const rows=db.prepare(`SELECT * FROM "${table}"`).all();
  for(const row of rows){const cols=Object.keys(row);restore.prepare(`INSERT INTO "${table}" (${cols.map(c=>'"'+c+'"').join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).run(...Object.values(row));}
}
check(fingerprint(restore),staleBefore);
denied(()=>localLockPlan({operation:op,operatorId:'A',review:{}}));
db.prepare("INSERT INTO financial_operations(id,owner_id,chain_id,resource,action,request_key,payload_hash,circle_key,status,created_at) VALUES ('local','A',5042002,'bounty:b','select_agent','local-request','local-hash','unused','claimed','2026-10-09')").run();
const local=db.prepare("SELECT * FROM financial_operations WHERE id='local'").get();
denied(()=>localLockPlan({operation:local,operatorId:'B',review:{}}));
const localPlan=localLockPlan({operation:local,operatorId:'A',review:{writesFrozen:true,atomicOutcomeVerified:true,outcome:'committed',snapshotDigest:digest(fingerprint(db))}});rehearseRecovery(db,localPlan,localPlan.approvalDigest);check(db.prepare("SELECT status FROM financial_operations WHERE id='local'").get().status,'complete');
db.prepare("INSERT INTO funding_sessions(chain_id,wallet_id,bounty_id) VALUES (5042002,'treasury','b')").run();
const session={chain_id:5042002,wallet_id:'treasury',bounty_id:'b'};const review={writesFrozen:true,chainId:5042002,walletId:'treasury',canonicalJobStatus:'Open',allowance:'0',allProviderRequestsAccountedFor:true,canonicalBlockHash:blockHash};
denied(()=>retireFundingSessionPlan({session,bounty:bounty(),operatorId:'A',review:{...review,allowance:'100'}}));
denied(()=>retireFundingSessionPlan({session,bounty:bounty(),operatorId:'A',review:{...review,allProviderRequestsAccountedFor:false}}));
const retirement=retireFundingSessionPlan({session,bounty:bounty(),operatorId:'A',review});
db.prepare("UPDATE financial_operations SET status='uncertain' WHERE id='op'").run();denied(()=>rehearseRecovery(db,retirement,retirement.approvalDigest));check(db.prepare('SELECT count(*) AS n FROM funding_sessions').get().n,1);
db.prepare("UPDATE financial_operations SET status='complete' WHERE id='op'").run();rehearseRecovery(db,retirement,retirement.approvalDigest);check(db.prepare('SELECT count(*) AS n FROM funding_sessions').get().n,0);
console.log(`PASS ${checks} offline recovery/rollback/backup checks. No remote apply or transaction sending exists.`);
db.close();restore.close();
