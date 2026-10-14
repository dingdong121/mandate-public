// Two real route owners, synthetic Circle accounts. No live signing.
import assert from 'node:assert/strict';
import { env,state,sqlite,route,seed,call,row,complete,contract,client,agent } from './route-harness.mjs';
env.CHAIN_WRITES_ENABLED='testnet-approved';
seed('publisher-A');seed('publisher-B');seed('no-fallback');
sqlite.prepare('DELETE FROM bounty_client_wallets').run();
sqlite.prepare('DELETE FROM agent_wallet_bindings').run();
sqlite.prepare("UPDATE contract_deployments SET contract_version=2").run();
sqlite.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES ('payer-A','A','A account','active','circle','primary',?,5042002)").run(client);
for(const [id,owner,wallet,address]of [['payer-A','A','primary',client],['agent','B','agent-wallet',agent]])sqlite.prepare('INSERT INTO agent_wallet_bindings(id,agent_id,owner_id,chain_id,wallet_id,wallet_address) VALUES (?,?,?,?,?,?)').run(id,id,owner,5042002,wallet,address);
sqlite.prepare("UPDATE bounties SET owner_id='B',provider_agent_id='payer-A' WHERE id='publisher-B'").run();
const fund=await route('app/api/bounties/[id]/fund/route.ts'),settle=await route('app/api/bounties/[id]/settle/route.ts');
assert.equal((await call(fund,'no-fallback','POST',{action:'execute'})).status,400);assert.equal(state.sends,0);
assert.equal((await call(fund,'publisher-A','POST',{action:'execute',payerAgentId:'agent'})).status,403);
assert.equal((await call(fund,'publisher-B','POST',{action:'execute',payerAgentId:'payer-A'},'B')).status,403);assert.equal(state.sends,0);
for(const [id,owner,payer,wallet,address]of [['publisher-A','A','payer-A','primary',client],['publisher-B','B','agent','agent-wallet',agent]]){
 assert.equal((await call(fund,id,'POST',{action:'execute',payerAgentId:payer,walletId:'attacker-wallet'},owner)).status,202);
 assert.equal(state.providerRequests.at(-1).walletId,wallet);
 assert.equal(state.providerRequests.at(-1).abiParameters[1],address);
 const pinned=sqlite.prepare('SELECT * FROM bounty_client_wallets WHERE bounty_id=?').get(id);
 assert.equal(pinned.owner_id,owner);assert.equal(pinned.wallet_address,address);
 // A concurrent request cannot replace the task's immutable funding account.
 assert.equal((await call(fund,id,'POST',{action:'execute',payerAgentId:owner==='A'?'agent':'payer-A'},owner)).status,409);
 assert.equal((await call(fund,id,'POST',{action:'execute'},owner==='A'?'B':'A')).status,404);
 complete(id,true);
 assert.equal((await call(fund,id,'POST',{action:'reconcile'},owner)).status,200);
 for(const stage of ['budget_pending','approve_pending','fund_pending']){
   assert.equal(row(id).funding_stage,stage);
   assert.equal((await call(fund,id,'POST',{action:'execute'},owner)).status,202);
   assert.equal(state.providerRequests.at(-1).walletId,wallet);
   complete(id,true);
   assert.equal((await call(fund,id,'POST',{action:'reconcile'},owner)).status,200);
 }
 assert.equal(row(id).status,'funded');
}
// Refund uses each pinned wallet, never the configured treasury as B fallback.
for(const [id,owner,wallet]of [['publisher-A','A','primary'],['publisher-B','B','agent-wallet']]){
 sqlite.prepare("UPDATE financial_operations SET status='complete' WHERE resource=?").run('bounty:'+id);
 sqlite.prepare("UPDATE bounties SET current_transaction_id=NULL,status='rejected',funding_stage='funded',contract_address=?,onchain_job_id='7' WHERE id=?").run(contract,id);
 assert.equal((await call(settle,id,'POST',{action:'refund'},owner)).status,202);
 assert.equal(state.providerRequests.at(-1).walletId,wallet);
 assert.equal((await call(settle,id,'POST',{action:'refund'},owner==='A'?'B':'A')).status,403);
}
// Owned profile and network binding must still match after pinning.
sqlite.prepare("UPDATE agent_wallet_bindings SET owner_id='A' WHERE agent_id='agent'").run();
const walletModule=await route('lib/client-wallet.ts');
await assert.rejects(walletModule.clientWallet(row('publisher-B')));
console.log('PASS two publisher signers / no treasury default / foreign wallet denied / immutable task payer / refund signer / stale ownership binding denied. MOCK only.');
sqlite.close();
