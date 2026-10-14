// Actual application routes; Circle and RPC are mocked. ZERO live writes.
import assert from 'node:assert/strict';
import {env,state,sqlite,route,seed,call,row,complete,contract} from './route-harness.mjs';
seed('main',5042);sqlite.prepare("UPDATE bounties SET status='draft' WHERE id='main'").run();
sqlite.prepare("INSERT INTO contract_deployments(id,owner_id,kind,circle_contract_id,transaction_id,contract_address,status,chain_id,contract_version) VALUES ('main-deployment','A','bounty_escrow','mock','mock',?,'complete',5042,2)").run(contract);
const fund=await route('app/api/bounties/[id]/fund/route.ts'),settle=await route('app/api/bounties/[id]/settle/route.ts');
env.CHAIN_WRITES_ENABLED='testnet-approved';env.WALLET_CREATION_ENABLED='testnet-approved';
assert.equal((await call(fund,'main','POST',{action:'execute'})).status,423);assert.equal(state.sends,0);
env.MAINNET_CHAIN_WRITES_ENABLED='mainnet-approved';
// Testnet credentials must not supply a Mainnet request.
assert.equal((await call(fund,'main','POST',{action:'execute'})).status,500);assert.equal(state.sends,0);
env.CIRCLE_MAINNET_API_KEY='mock-main-key';env.CIRCLE_MAINNET_ENTITY_SECRET='mock-main-secret';
state.chain='0x'+(5042).toString(16);state.walletNetwork='ARC';
state.walletNetwork='ARC-TESTNET';assert.equal((await call(fund,'main','POST',{action:'execute'})).status,409);assert.equal(state.sends,0);state.walletNetwork='ARC';
for(let i=0;i<4;i++){assert.equal((await call(fund,'main','POST',{action:'execute'})).status,202);complete('main');assert.equal((await call(fund,'main','POST',{action:'reconcile'})).status,200);}
assert.equal(row('main').status,'funded');assert.equal(state.sends,4);
assert.equal((await call(settle,'main','POST',{action:'submit',deliverable:'Mainnet mock delivery'},'B')).status,202);complete('main',false);assert.equal((await call(settle,'main','POST',{action:'reconcile'},'B')).status,200);
assert.equal((await call(settle,'main','POST',{action:'approve'})).status,202);complete('main',false);assert.equal((await call(settle,'main','POST',{action:'reconcile'})).status,200);assert.equal(row('main').status,'completed');
const sends=state.sends;assert.equal((await call(settle,'main','POST',{action:'approve'})).status,409);assert.equal(state.sends,sends);
const client=await route('lib/client-wallet.ts');
sqlite.prepare("DELETE FROM bounty_client_wallets WHERE bounty_id='main'").run();
await assert.rejects(()=>client.clientWallet({id:'main',ownerId:'A',chainId:5042,onchainJobId:'7',contractAddress:contract,createJobTxHash:'0x123'}),e=>e instanceof Response&&e.status===400);
console.log('PASS Mainnet actual-route funding/submit/payment mocks; Testnet flag cannot enable Mainnet; missing Mainnet credentials and wrong Circle network deny zero sends; duplicate payment denied; no Mainnet treasury fallback. NOT live Mainnet verification.');sqlite.close();
