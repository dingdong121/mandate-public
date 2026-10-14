// Targeted actual-route regression only. In-memory DB, mock SDK/RPC, no secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { env, state, sqlite, route, seed, call, row, complete, agent, contract, client } from './route-harness.mjs';
let checks=0;function check(a,b){assert.equal(a,b);checks++;}
const fund=await route('app/api/bounties/[id]/fund/route.ts');
const settle=await route('app/api/bounties/[id]/settle/route.ts');
const gate=await route('lib/chain-write-control.ts');
const executor=await route('lib/escrow-transactions.ts');
const safe=await route('lib/arc-safety.ts');
const deploy=await route('app/api/contracts/escrow/route.ts');
const gas=await route('app/api/agents/[id]/gas/route.ts');
const wallet=await route('app/api/agents/[id]/wallet/route.ts');
seed();sqlite.prepare("UPDATE contract_deployments SET contract_version=2").run();
// Missing, false-looking, invalid and browser-provided enable attempts fail closed.
for(const flag of [undefined,'false','true','1','TESTNET-APPROVED','testnet-approved ']){
 env.CHAIN_WRITES_ENABLED=flag;
 const before=JSON.stringify(row());
 check((await call(fund,'test','POST',{action:'execute',CHAIN_WRITES_ENABLED:'testnet-approved'})).status,423);
 check(JSON.stringify(row()),before);check(state.sends,0);
 check(sqlite.prepare('SELECT count(*) n FROM financial_operations').get().n,0);
}
env.CHAIN_WRITES_ENABLED=undefined;
for(const stage of ['draft','budget_pending','approve_pending','fund_pending']){
 sqlite.prepare('UPDATE bounties SET funding_stage=?,onchain_job_id=? WHERE id=?').run(stage,'7','test');
 check((await call(fund,'test','POST',{action:'execute'})).status,423);
}
for(const [action,status,user]of [['submit','funded','B'],['approve','submitted','A'],['reject','submitted','A'],['refund','rejected','A']]){
 sqlite.prepare('UPDATE bounties SET status=?,funding_stage=?,contract_address=?,onchain_job_id=? WHERE id=?').run(status,'funded',contract,'7','test');
 const before=JSON.stringify(row());
 check((await call(settle,'test','POST',{action,deliverable:'local fixture'},user)).status,423);
 check(JSON.stringify(row()),before);check(state.sends,0);
}
check((await call(deploy,'unused','POST')).status,423);
check((await call(gas,'agent','POST')).status,423);
check((await call(fund,'test')).status,200);check((await call(settle,'test')).status,200);
check((await call(deploy,'unused')).status,200);
// Defense-in-depth: bypass route -> all signatures still rejected by send helper.
for(const signature of ['createJob(address,address,uint256,string,address)','setBudget(uint256,uint256,bytes)','approve(address,uint256)','fund(uint256,bytes)','submit(uint256,bytes32)','complete(uint256,bytes32)','reject(uint256,bytes32)','refund(uint256)']){
 let rejected=false;try{await executor.sendEscrow(new Request('https://local.test'), 'A',row(),'local', 'primary',client,contract,signature,[]);}catch(e){rejected=e instanceof Response&&e.status===423;}
 check(rejected,true);check(state.sends,0);
}
let callbacks=0;try{gate.guardedChainWrite(5042002,()=>callbacks++);}catch(e){check(e.status,423);}check(callbacks,0);
for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sendTransaction','eth_sign','debug_setHead']){
 let rejected=false;try{await safe.rpc('https://offline.invalid',method,[]);}catch(e){rejected=e instanceof Response&&e.status===405;}check(rejected,true);
}
// Exact Testnet enable does not enable Mainnet or existing independent pauses.
env.CHAIN_WRITES_ENABLED='testnet-approved';
try{gate.guardedChainWrite(5042,()=>callbacks++);}catch(e){check(e.status,423);}check(callbacks,0);
check((await call(deploy,'unused','POST')).status,423);check((await call(gas,'agent','POST')).status,423);
// Receipt reconciliation remains allowed while sending is disabled.
seed('receipt');check((await call(fund,'receipt','POST',{action:'execute'})).status,202);complete('receipt');
const sent=state.sends;env.CHAIN_WRITES_ENABLED=undefined;
check((await call(fund,'receipt')).status,200);
check((await call(fund,'receipt','POST',{action:'reconcile'})).status,200);
check(row('receipt').onchain_job_id,'7');check(state.sends,sent);
// No wallet-resource mutation when its independent switch is absent.
sqlite.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider) VALUES ('blank','B','Synthetic B profile','active','none')").run();
check((await call(wallet,'blank','POST',{},'B')).status,423);
check(sqlite.prepare("SELECT status FROM agents WHERE id='blank'").get().status,'active');
// Nonfinancial actual handlers remain usable while closed. Synthetic binding is
// isolated test fixture only, never a production-connected claim.
const posts=await route('app/api/bounties/route.ts'),invites=await route('app/api/invitations/route.ts');
const apps=await route('app/api/bounties/[id]/applications/route.ts'),selection=await route('app/api/bounties/[id]/select/route.ts');
const profile=await route('app/api/agents/route.ts');
const made=await call(profile,'unused','POST',{name:'Local blank B Agent',tagline:'Researches local fixtures',about:'Offline only',skills:['Research'],typicalDeliveryTime:'one day'},'B');check(made.status,201);
const created=(await made.json()).agent;check(created.ownerId,'B');check(created.walletProvider,'none');
const body={title:'Local paused journey',objective:'Synthetic task',criteria:['Local deliverable'],rewardMicros:100000,deadline:new Date(Date.now()+3600000).toISOString()};
const proposal={agentId:'agent',proposal:'We will complete this synthetic local task.',expectedDeliveryTime:'24 hours'};
for(const source of ['invited','organic']){
 const result=await call(posts,'unused','POST',{...body,title:body.title+source});check(result.status,201);const job=(await result.json()).bounty;
 if(source==='invited'){check((await call(invites,'unused','POST',{bountyId:job.id,agentId:'agent'})).status,201);check(sqlite.prepare('SELECT count(*) n FROM applications WHERE bounty_id=?').get(job.id).n,0);}
 check((await call(apps,job.id,'POST',{...proposal,agentId:created.id},'B')).status,409);
 check((await call(apps,job.id,'POST',proposal,'C')).status,400);
 const applied=await call(apps,job.id,'POST',proposal,'B');check(applied.status,201);check((await applied.json()).source,source);
 check((await call(apps,job.id,'POST',proposal,'B')).status,409);
 check((await call(selection,job.id,'POST',{agentId:'agent'},'B')).status,403);
 check((await call(selection,job.id,'POST',{agentId:'agent'})).status,200);
 check((await call(fund,job.id,'POST',{action:'execute'})).status,423);check(state.sends,sent);
}
// Audit send-surface inventory: fail if a new direct SDK/RPC sender appears.
// Simulate a gate change while signer read awaits: final boundary still blocks.
env.CHAIN_WRITES_ENABLED='testnet-approved';env.CIRCLE_PRIMARY_WALLET_ID='primary-late';
seed('late-pause');state.disableOnWalletRead=true;
check((await call(fund,'late-pause','POST',{action:'execute'})).status,423);
check(state.sends,sent);
check(sqlite.prepare("SELECT status FROM financial_operations WHERE resource='bounty:late-pause'").get().status,'failed');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(dir+'/'+d.name):/\.tsx?$/.test(d.name)?[dir+'/'+d.name]:[]);}
const hits=files('app').concat(files('lib')).filter(file=>/\b(createContractExecutionTransaction|createTransaction|createTransferTransaction|deployContract|sendTransaction|sendRawTransaction|eth_sendTransaction|eth_sendRawTransaction|signTransaction)\s*(?:\(|["'])/.test(fs.readFileSync(file,'utf8')));
assert.deepEqual(hits.sort(),['lib/escrow-deployment.ts','lib/escrow-transactions.ts']);checks++;
console.log(`PASS ${checks} focused pause/default/route/send-boundary/readonly/reconcile/ownership/nonfinancial journey checks. Mock sends during paused operations: 0. One allowed mocked send prepared a receipt. No production or network calls.`);
sqlite.close();
