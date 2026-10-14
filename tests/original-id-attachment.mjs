import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {env,state,sqlite,route,seed,call,row,contract,client} from './route-harness.mjs';
seed('attach');env.CHAIN_WRITES_ENABLED='testnet-approved';
sqlite.prepare("UPDATE bounties SET status='submitted',funding_stage='funded',contract_address=?,onchain_job_id='1' WHERE id='attach'").run(contract);
const settle=await route('app/api/bounties/[id]/settle/route.ts'),recover=await route('app/api/bounties/[id]/recover/route.ts');
sqlite.prepare("UPDATE bounties SET title='MVP recovery drill local fixture' WHERE id='attach'").run();
env.TESTNET_RESPONSE_LOSS_BOUNTY_ID='attach';
assert.equal((await call(settle,'attach','POST',{action:'approve'})).status,503);
env.TESTNET_RESPONSE_LOSS_BOUNTY_ID=undefined;
const original=sqlite.prepare("SELECT * FROM financial_operations WHERE resource='bounty:attach'").get();assert.equal(original.status,'uncertain');assert.equal(state.sends,1);
const visible=await call(recover,'attach','GET');assert.equal(visible.status,200);assert.equal((await visible.json()).canRecover,true);
const foreign=await call(recover,'attach','GET',undefined,'B');assert.equal(foreign.status,200);assert.equal((await foreign.json()).canRecover,false);
const request=state.providerRequests[0],tx=state.transactions.get('tx-1');
Object.assign(tx,{state:'COMPLETE',walletId:'primary',blockchain:'ARC-TESTNET',refId:original.id});
const abi=new Interface([`function ${request.abiFunctionSignature}`]);
const chainTx={hash:tx.txHash,from:client,to:contract,input:abi.encodeFunctionData('complete',request.abiParameters),chainId:state.chain,value:'0x0'};
state.rpcOverride=(method,params)=>method==='eth_chainId'?state.chain:method==='eth_getCode'?'0x6000':method==='eth_getTransactionByHash'?chainTx:method==='eth_getTransactionReceipt'?state.receipts.get(params[0]):null;
assert.equal((await call(recover,'attach','POST',{transactionId:'tx-1'},'B')).status,409);
for(const [field,wrong] of [['walletId','foreign-wallet'],['blockchain','ARC'],['refId','wrong-ref'],['state','INITIATED']]){const old=tx[field];tx[field]=wrong;assert.equal((await call(recover,'attach','POST',{transactionId:'tx-1'})).status,409);tx[field]=old;}
const originalInput=chainTx.input;chainTx.input=abi.encodeFunctionData('complete',['2',request.abiParameters[1],'0x']);assert.equal((await call(recover,'attach','POST',{transactionId:'tx-1'})).status,409);chainTx.input=originalInput;
// Genuine hard-crash durable state (catch never ran), not just uncertain.
sqlite.prepare("UPDATE financial_operations SET status='claimed' WHERE id=?").run(original.id);
assert.equal((await call(recover,'attach','POST',{transactionId:'tx-1'})).status,200);assert.equal(state.sends,1);
assert.equal(row('attach').settlement_transaction_id,'tx-1');assert.equal(row('attach').settlement_idempotency_key,original.circle_key);
assert.equal((await call(settle,'attach','POST',{action:'reconcile'})).status,200);assert.equal(row('attach').status,'completed');
assert.equal((await (await call(recover,'attach','GET')).json()).canRecover,false);
assert.equal((await call(recover,'attach','POST',{transactionId:'tx-1'})).status,409);assert.equal(state.sends,1);
console.log('PASS original-ID attachment through real route and SQLite; owner/wallet/network/ref/state/payload checks; claimed hard-crash lock recovery; completion receipt reconciliation; no new send and no replacement key. MOCK Circle/RPC, not live outage.');sqlite.close();
