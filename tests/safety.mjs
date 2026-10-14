// Real route handlers + actual SQLite constraints, mocked Circle/RPC only.
// No network, secrets, persistent database, or real-wallet transaction access.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { Interface } from 'ethers';
const root=process.cwd(), sqlite=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(`drizzle/${file}`,'utf8'));
const d1={prepare(sql){let params=[];const stmt={bind(...p){params=p;return stmt;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){const results=sqlite.prepare(sql).all(...params);return {results,success:true,meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}};},async raw(){const query=sqlite.prepare(sql);query.setReturnArrays(true);return query.all(...params);},async run(){const meta=sqlite.prepare(sql).run(...params);return {results:[],success:true,meta:{changes:Number(meta.changes),last_row_id:Number(meta.lastInsertRowid)}};}};return stmt;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.all());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const client='0x1111111111111111111111111111111111111111',agent='0x2222222222222222222222222222222222222222',contract='0x3333333333333333333333333333333333333333';
const state={sends:0,chain:'0x4cef52',transactions:new Map(),receipts:new Map(),nextJob:7n,throwAfterSend:false};
// Correct Testnet chain hex, computed rather than memorized.
state.chain='0x'+(5042002).toString(16);
const eventAbi=new Interface(['event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiresAt,string description)','event BudgetSet(uint256 indexed jobId,uint256 amount)','event Funded(uint256 indexed jobId,uint256 amount)','event Submitted(uint256 indexed jobId,bytes32 deliverableHash)','event Completed(uint256 indexed jobId,bytes32 reasonHash)','event Rejected(uint256 indexed jobId,bytes32 reasonHash)','event Refunded(uint256 indexed jobId,uint256 amount)','event Approval(address indexed owner,address indexed spender,uint256 value)']);
const mockCircle={async getWallet({id}){return {data:{wallet:{id,address:id.startsWith('primary')?client:agent,blockchain:'ARC-TESTNET'}}};},async getTransaction({id}){return {data:{transaction:state.transactions.get(id)}};},async createContractExecutionTransaction(input){state.sends++;const id=`tx-${state.sends}`,hash='0x'+state.sends.toString(16).padStart(64,'0');state.transactions.set(id,{id,state:'INITIATED',txHash:hash});const fn=input.abiFunctionSignature.split('(')[0],p=input.abiParameters;let name,args;
 if(fn==='createJob'){name='JobCreated';args=[state.nextJob++,client,p[0],p[1],BigInt(p[2]),p[3]];}
 if(fn==='setBudget'){name='BudgetSet';args=[BigInt(p[0]),BigInt(p[1])];}
 if(fn==='approve'){name='Approval';args=[client,p[0],BigInt(p[1])];}
 if(fn==='fund'){name='Funded';args=[BigInt(p[0]),100000n];}
 if(fn==='submit'){name='Submitted';args=[BigInt(p[0]),p[1]];}
 if(fn==='complete'){name='Completed';args=[BigInt(p[0]),p[1]];}
 if(fn==='reject'){name='Rejected';args=[BigInt(p[0]),p[1]];}
 if(fn==='refund'){name='Refunded';args=[BigInt(p[0]),100000n];}
 const sender=input.walletId.startsWith('primary')?client:agent;
 const encoded=eventAbi.encodeEventLog(eventAbi.getEvent(name),args),logs=[{address:input.contractAddress,...encoded}];
 if(['fund','complete','refund'].includes(fn)){const transferAbi=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);logs.push({address:'0x3600000000000000000000000000000000000000',...transferAbi.encodeEventLog(transferAbi.getEvent('Transfer'),[fn==='fund'?sender:input.contractAddress,fn==='fund'?input.contractAddress:fn==='complete'?agent:sender,100000n])});}
 state.receipts.set(hash,{status:'0x1',transactionHash:hash,to:input.contractAddress,from:sender,logs});if(state.throwAfterSend)throw Error('simulated transport failure');return {data:{id}};}};
const env={DB:d1,CIRCLE_API_KEY:'local-mock-not-a-credential',CIRCLE_ENTITY_SECRET:'local-mock-not-a-credential',CIRCLE_PRIMARY_WALLET_ID:'primary',CIRCLE_PRIMARY_WALLET_ADDRESS:client,CHAIN_WRITES_ENABLED:'testnet-approved'};
const context=vm.createContext({console,Request,Response,Headers,URL,AbortSignal,TextEncoder,Uint8Array,crypto,setTimeout,clearTimeout,fetch:async(_url,options)=>{const {method,params}=JSON.parse(options.body);let result;if(method==='eth_chainId')result=state.chain;else if(method==='eth_getCode')result='0x6000';else if(method==='eth_call')result='0x'+(100000n).toString(16);else if(method==='eth_getTransactionReceipt')result=state.receipts.get(params[0])??null;else throw Error(`Unexpected RPC ${method}`);return Response.json({result});}});
const modules=new Map();
async function moduleFor(spec,parent=root+'/entry.ts'){
 let file=spec.startsWith('@/')?path.join(root,spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(parent),spec):null;
 if(file&&!path.extname(file))file=fs.existsSync(file+'.ts')?file+'.ts':path.join(file,'index.ts');
 const id=file||spec;if(modules.has(id))return modules.get(id);
 let mod;if(file){const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;mod=new vm.SourceTextModule(source,{context,identifier:file});}
 else{const exports=spec==='cloudflare:workers'?{env}:spec==='@circle-fin/developer-controlled-wallets'?{initiateDeveloperControlledWalletsClient:()=>mockCircle}:spec==='server-only'?{}:await import(spec);mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:id});}
 modules.set(id,mod);return mod;
}
async function route(file){const mod=await moduleFor('@/'+file);if(mod.status==='unlinked')await mod.link((s,m)=>moduleFor(s,m.identifier));if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace;}
const fund=await route('app/api/bounties/[id]/fund/route.ts'),settle=await route('app/api/bounties/[id]/settle/route.ts'),safe=await route('lib/arc-safety.ts');
let checks=0;
function check(actual,expected){assert.equal(actual,expected);checks++;}
function seed(id='test',chain=5042002){sqlite.prepare("INSERT OR IGNORE INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES ('agent','B','Local agent','active','circle','agent-wallet',?,?)").run(agent,chain);sqlite.prepare("INSERT OR IGNORE INTO contract_deployments(id,owner_id,kind,circle_contract_id,transaction_id,contract_address,status,chain_id) VALUES ('deployment','A','bounty_escrow','local','local',?,'complete',5042002)").run(contract);sqlite.prepare("INSERT INTO bounties(id,owner_id,provider_agent_id,title,objective,acceptance_criteria,reward_micros,deadline,status,chain_id) VALUES (?,'A','agent','Local test','local objective','[]',100000,?,'draft',?)").run(id,new Date(Date.now()+3600000).toISOString(),chain);
const wallet=env.CIRCLE_PRIMARY_WALLET_ID||'primary',payerId='fixture-payer-'+wallet;
sqlite.prepare("INSERT OR IGNORE INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES (?,'A','Synthetic payer','active','circle',?,?,?)").run(payerId,wallet,client,chain);
sqlite.prepare("INSERT OR IGNORE INTO agent_wallet_bindings(id,agent_id,owner_id,chain_id,wallet_id,wallet_address) VALUES (?,?,'A',?,?,?)").run(payerId,payerId,chain,wallet,client);
sqlite.prepare("INSERT INTO bounty_client_wallets(bounty_id,owner_id,chain_id,agent_id,wallet_id,wallet_address) VALUES (?,'A',?,?,?,?)").run(id,chain,payerId,wallet,client);
}
async function call(handler,id,method='GET',body={},user='A',key=crypto.randomUUID(),origin='https://local.test'){return handler[method](new Request(`https://local.test/api/bounties/${id}`,{method,headers:{'oai-authenticated-user-id':user,origin,'content-type':'application/json','idempotency-key':key},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({id})});}
function row(id='test'){return sqlite.prepare('SELECT * FROM bounties WHERE id=?').get(id);}
function complete(id='test',funding=true){state.transactions.get(row(id)[funding?'current_transaction_id':'settlement_transaction_id']).state='COMPLETE';}
seed();sqlite.prepare("UPDATE contract_deployments SET contract_version=2 WHERE id='deployment'").run();const historical=JSON.stringify({id:'historical-paid-fixture',hash:'historical-fixed',status:'completed'});seed('historical-paid-fixture');sqlite.prepare("UPDATE bounties SET status='completed',funding_stage='funded',complete_tx_hash='historical-fixed' WHERE id='historical-paid-fixture'").run();const before=JSON.stringify(row('historical-paid-fixture'));
check((await call(fund,'test','POST',{action:'execute'},'B')).status,404);
check((await call(fund,'test','POST',{action:'execute'},'A',crypto.randomUUID(),'https://evil.test')).status,403);
const key=crypto.randomUUID();const concurrent=await Promise.all(Array.from({length:12},()=>call(fund,'test','POST',{action:'execute'},'A',key)));
check(concurrent.filter(r=>r.status===202).length,12);check(state.sends,1);
complete();const snapshot=JSON.stringify(row());for(let i=0;i<8;i++)check((await call(fund,'test')).status,200);check(JSON.stringify(row()),snapshot);check(state.sends,1);
check((await call(fund,'test','POST',{action:'reconcile'})).status,200);check(row().onchain_job_id,'7');check(state.sends,1);
for(const stage of ['budget_pending','approve_pending','fund_pending']){check(row().funding_stage,stage);check((await call(fund,'test','POST',{action:'execute'})).status,202);complete();check((await call(fund,'test','POST',{action:'reconcile'})).status,200);}
check(row().status,'funded');check(state.sends,4);
check((await call(settle,'test','POST',{action:'submit',deliverable:'local delivery'},'A')).status,403);
check((await call(settle,'test','POST',{action:'submit',deliverable:'local delivery'},'B')).status,202);complete('test',false);const snap2=JSON.stringify(row());check((await call(settle,'test')).status,200);check(JSON.stringify(row()),snap2);check((await call(settle,'test','POST',{action:'reconcile'},'B')).status,200);check(row().status,'submitted');
const decisions=await Promise.all([call(settle,'test','POST',{action:'approve'}),call(settle,'test','POST',{action:'reject'})]);check(decisions.filter(r=>r.status===202).length,1);check(state.sends,6);complete('test',false);check((await call(settle,'test','POST',{action:'reconcile'})).status,200);check(row().status,decisions[0].status===202?'completed':'rejected');check((await call(settle,'test','POST',{action:'approve'})).status,409);
seed('legacy');sqlite.prepare("UPDATE contract_deployments SET contract_version=1 WHERE id='deployment'").run();check((await call(fund,'legacy','POST',{action:'execute'})).status,423);sqlite.prepare("UPDATE contract_deployments SET contract_version=2 WHERE id='deployment'").run();
seed('mainnet',5042);check((await call(fund,'mainnet','POST',{action:'execute'})).status,423);
seed('wrong-rpc');state.chain='0x13b2';check((await call(fund,'wrong-rpc','POST',{action:'execute'})).status,503);state.chain='0x'+(5042002).toString(16);
seed('ambiguous');state.throwAfterSend=true;check((await call(fund,'ambiguous','POST',{action:'execute'})).status,503);const sends=state.sends;check((await call(fund,'ambiguous','POST',{action:'execute'})).status,409);check(state.sends,sends);state.throwAfterSend=false;
const good=state.receipts.get(state.transactions.get('tx-1').txHash);for(const changed of [{...good,to:agent},{...good,from:agent},{...good,status:'0x0'}]){assert.throws(()=>safe.validateReceipt(changed,good.transactionHash,contract,client));checks++;}
assert.throws(()=>safe.jobIdFromReceipt({...good,logs:good.logs.map(l=>({...l,address:agent}))},contract,client,agent,client,Math.floor(Date.parse(row().deadline)/1000),'local objective'));checks++;
assert.throws(()=>safe.assertTestnet(5042));checks++;assert.throws(()=>safe.validExpiry('invalid'));checks++;
check(JSON.stringify(row('historical-paid-fixture')),before);void historical;
// Different request keys are serialized as well, not just same-key replays.
env.CIRCLE_PRIMARY_WALLET_ID='primary-distinct';seed('distinct-keys');const d=await Promise.all(Array.from({length:12},()=>call(fund,'distinct-keys','POST',{action:'execute'})));check(d.filter(r=>r.status===202).length,1);seed('signer-conflict');const beforeConflict=state.sends;check((await call(fund,'signer-conflict','POST',{action:'execute'})).status,409);check(state.sends,beforeConflict);env.CIRCLE_PRIMARY_WALLET_ID='primary';
const intents=await route('app/api/intents/route.ts'),review=await route('app/api/intents/[id]/route.ts'),selection=await route('app/api/bounties/[id]/select/route.ts'),revision=await route('app/api/bounties/[id]/revision/route.ts');
sqlite.prepare("INSERT INTO policies(id,agent_id,daily_limit_micros,transaction_limit_micros,day_index) VALUES ('policy','agent',100000,30000,?)").run(Math.floor(Date.now()/86400000));
sqlite.prepare("INSERT INTO allowed_recipients(id,agent_id,address,service_name) VALUES ('recipient','agent',?,'local')").run(client);
function intentBody(){return {agentId:'agent',recipient:client,amountMicros:30000,purpose:'Local test dataset',idempotencyKey:crypto.randomUUID()};}
const quota=await Promise.all(Array.from({length:12},()=>call(intents,'unused','POST',intentBody(),'B')));assert(quota.every(r=>[201,409].includes(r.status)));checks++;const reserved=sqlite.prepare("SELECT spent_today_micros AS n FROM policies WHERE id='policy'").get().n;assert(reserved>=30000&&reserved<=90000);checks++;
for(let i=0;i<3;i++)check((await call(intents,'unused','POST',intentBody(),'B')).status,201);check(sqlite.prepare("SELECT spent_today_micros AS n FROM policies WHERE id='policy'").get().n,90000);check(sqlite.prepare("SELECT count(*) AS n FROM ledger_entries WHERE status='authorized'").get().n,3);
sqlite.prepare("INSERT INTO ledger_entries(id,owner_id,agent_id,kind,amount_micros,recipient_address,purpose,policy_decision,status,idempotency_key) VALUES ('review','B','agent','payment_intent',-5000,?,'Local test dataset','{}','review_required','review-local')").run(client);
const reviews=await Promise.all([call(review,'review','PATCH',{action:'approve'},'B'),call(review,'review','PATCH',{action:'approve'},'B')]);check(reviews.filter(r=>r.status===200).length,1);check(sqlite.prepare("SELECT spent_today_micros AS n FROM policies WHERE id='policy'").get().n,95000);
seed('selection');sqlite.prepare("UPDATE bounties SET status='open',provider_agent_id=NULL WHERE id='selection'").run();sqlite.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address) VALUES ('agent-two','B','Second local agent','active','circle','another-wallet',?)").run(agent);
for(const id of ['agent','agent-two'])sqlite.prepare("INSERT INTO applications(id,bounty_id,agent_id,owner_id,proposal,expected_delivery_time,proposed_amount_micros) VALUES (?,'selection',?,'B','Local proposal','one day',100000)").run('app-'+id,id);
const selections=await Promise.all([call(selection,'selection','POST',{agentId:'agent'}),call(selection,'selection','POST',{agentId:'agent-two'})]);check(selections.filter(r=>r.status===200).length,1);const chosen=sqlite.prepare("SELECT agent_id FROM applications WHERE bounty_id='selection' AND status='selected'").all();check(chosen.length,1);check(chosen[0].agent_id,row('selection').provider_agent_id);
seed('revision-race');sqlite.prepare("UPDATE bounties SET status='submitted',funding_stage='funded',contract_address=?,onchain_job_id='20' WHERE id='revision-race'").run(contract);
const race=await Promise.all([call(revision,'revision-race','POST',{note:'Please improve the local result'}),call(settle,'revision-race','POST',{action:'approve'})]);check(race.filter(r=>[200,202].includes(r.status)).length,1);check(race.filter(r=>r.status===409).length,1);
// Anonymous private access fails even when query parameters pretend to be A.
const anonBefore=JSON.stringify(sqlite.prepare('SELECT * FROM financial_operations ORDER BY id').all());
for(const file of ['app/api/bounties/[id]/fund/route.ts','app/api/bounties/[id]/settle/route.ts','app/api/bounties/[id]/applications/route.ts','app/api/dashboard/actions/route.ts','app/api/intents/route.ts','app/api/invitations/route.ts']){
 const handler=await route(file);const response=await handler.GET(new Request('https://local.test/api/private?ownerId=A&userId=A'),{params:Promise.resolve({id:'test'})});check(response.status,401);
}
check((await call(fund,'test','POST',{action:'execute'},'')).status,401);check((await call(settle,'test','POST',{action:'approve'},'')).status,401);
const directory=await route('app/api/agents/route.ts');const publicProfiles=await directory.GET(new Request('https://local.test/api/agents?scope=directory'));check(publicProfiles.status,200);
const profiles=await publicProfiles.json();check(profiles.agents.every(a=>!('ownerId' in a)&&!('walletAddress' in a)&&!('walletId' in a)),true);
check(JSON.stringify(sqlite.prepare('SELECT * FROM financial_operations ORDER BY id').all()),anonBefore);
// Two platform users through actual profile/post/invite/apply/select handlers.
// Connected wallet metadata below is a synthetic fixture, not wallet creation.
const posts=await route('app/api/bounties/route.ts'),invites=await route('app/api/invitations/route.ts'),apps=await route('app/api/bounties/[id]/applications/route.ts');
const made=await call(directory,'unused','POST',{name:'Local B Research Agent',tagline:'Researches local fixtures',about:'Synthetic multi-user regression profile',skills:['Research'],typicalDeliveryTime:'one day',ownerId:'A'},'B');check(made.status,201);
const profile=(await made.json()).agent;check(profile.ownerId,'B');check(profile.walletProvider,'none');
sqlite.prepare("UPDATE agents SET wallet_provider='circle',wallet_id='local-b-wallet',wallet_address=? WHERE id=?").run(agent,profile.id);
const postBody={title:'Local cross-user journey',objective:'Synthetic local task',criteria:['Produce a local result'],rewardMicros:100000,deadline:new Date(Date.now()+3600000).toISOString(),ownerId:'B'};
const posted=await call(posts,'unused','POST',postBody);check(posted.status,201);const job=(await posted.json()).bounty;check(job.ownerId,'A');
const baselineSends=state.sends;
check((await call(fund,job.id,'POST',{action:'execute'})).status,409);
check((await call(invites,'unused','POST',{bountyId:job.id,agentId:profile.id},'C')).status,403);
const invited=await call(invites,'unused','POST',{bountyId:job.id,agentId:profile.id,note:'Local invitation'});check(invited.status,201);
check(sqlite.prepare('SELECT count(*) n FROM applications WHERE bounty_id=?').get(job.id).n,0);
check((await call(invites,'unused','POST',{bountyId:job.id,agentId:profile.id})).status,409);
const received=await call(invites,'unused','GET',{},'B');check((await received.json()).invitations.some(i=>i.bountyId===job.id),true);
check((await (await call(invites,'unused','GET',{},'C')).json()).invitations.length,0);
const proposal={agentId:profile.id,proposal:'We will produce the requested synthetic local research result.',expectedDeliveryTime:'24 hours',ownerId:'B'};
check((await call(apps,job.id,'POST',proposal,'A')).status,403);
check((await call(apps,job.id,'POST',proposal,'C')).status,400);
const submitted=await call(apps,job.id,'POST',proposal,'B');check(submitted.status,201);check((await submitted.json()).source,'invited');
check(sqlite.prepare('SELECT status FROM invitations WHERE bounty_id=?').get(job.id).status,'applied');
check((await call(apps,job.id,'POST',proposal,'B')).status,409);
check((await call(apps,job.id,'GET',{},'C')).status,403);
check((await (await call(apps,job.id,'GET',{},'A')).json()).applications.length,1);
check((await call(selection,job.id,'POST',{agentId:profile.id},'B')).status,403);
check((await call(selection,job.id,'POST',{agentId:profile.id})).status,200);check(row(job.id).provider_agent_id,profile.id);check(state.sends,baselineSends);
// Four explicit funding steps, explicit submission and explicit approval.
env.CIRCLE_PRIMARY_WALLET_ID='primary-journey';
sqlite.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES ('journey-payer','A','Synthetic payer','active','circle','primary-journey',?,5042002)").run(client);
sqlite.prepare("INSERT INTO agent_wallet_bindings(id,agent_id,owner_id,chain_id,wallet_id,wallet_address) VALUES ('journey-payer','journey-payer','A',5042002,'primary-journey',?)").run(client);
for(let stage=0;stage<4;stage++){check((await call(fund,job.id,'POST',{action:'execute',payerAgentId:'journey-payer'})).status,202);complete(job.id);check((await call(fund,job.id,'POST',{action:'reconcile'})).status,200);}
check(row(job.id).status,'funded');check((await call(settle,job.id,'POST',{action:'submit',deliverable:'Synthetic local result'},'C')).status,404);
check((await call(settle,job.id,'POST',{action:'submit',deliverable:'Synthetic local result'},'B')).status,202);complete(job.id,false);check((await call(settle,job.id,'POST',{action:'reconcile'},'B')).status,200);
check((await call(settle,job.id,'POST',{action:'approve'},'B')).status,403);
const payClicks=await Promise.all(Array.from({length:8},()=>call(settle,job.id,'POST',{action:'approve'})));check(payClicks.filter(r=>r.status===202).length,1);complete(job.id,false);check((await call(settle,job.id,'POST',{action:'reconcile'})).status,200);check(row(job.id).status,'completed');check(state.sends,baselineSends+6);
check((await call(settle,job.id,'POST',{action:'approve'})).status,409);check(state.sends,baselineSends+6);
const organicPost=await call(posts,'unused','POST',{...postBody,title:'Local organic journey'});const organic=(await organicPost.json()).bounty;
const organicApps=await Promise.all(Array.from({length:8},()=>call(apps,organic.id,'POST',proposal,'B')));check(organicApps.filter(r=>r.status===201).length,1);check(organicApps.every(r=>[201,409].includes(r.status)),true);
check(sqlite.prepare('SELECT source FROM applications WHERE bounty_id=?').get(organic.id).source,'organic');check(state.sends,baselineSends+6);
const racePost=await call(posts,'unused','POST',{...postBody,title:'Local invitation race'});const raceJob=(await racePost.json()).bounty;
const inviteClicks=await Promise.all(Array.from({length:8},()=>call(invites,'unused','POST',{bountyId:raceJob.id,agentId:profile.id})));check(inviteClicks.filter(r=>r.status===201).length,1);check(inviteClicks.every(r=>[201,409].includes(r.status)),true);
check(sqlite.prepare('SELECT count(*) n FROM invitations WHERE bounty_id=?').get(raceJob.id).n,1);
check((await call(selection,raceJob.id,'POST',{agentId:profile.id})).status,400);
const dashboard=await route('app/api/dashboard/actions/route.ts');const privateA=await (await call(directory,'unused','GET',{},'A')).json();check(privateA.agents.every(a=>a.id!==profile.id),true);
const privateB=await (await call(directory,'unused','GET',{},'B')).json();check(privateB.agents.some(a=>a.id===profile.id),true);
check((await call(dashboard,'unused','GET',{},'C')).status,200);
const blankDashboard=await (await call(dashboard,'unused','GET',{},'C')).json();check(JSON.stringify(blankDashboard).includes(job.id),false);
sqlite.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider) VALUES ('unconnected','B','Local unconnected','active','none'),('demo-fixture','B','Local demo','demo','none')").run();
check((await call(apps,raceJob.id,'POST',{...proposal,agentId:'unconnected'},'B')).status,409);
check((await call(apps,raceJob.id,'POST',{...proposal,agentId:'demo-fixture'},'B')).status,400);
check((await call(invites,'unused','POST',{bountyId:raceJob.id,agentId:'demo-fixture'})).status,400);
check(JSON.stringify(row('historical-paid-fixture')),before);
console.log(`PASS ${checks} route/receipt/concurrency/ownership/readonly/history-fixture checks, including two-user profile-to-payment and invited/organic journeys. Mocked Circle and RPC; production and Arc not touched. Gateway header sanitization is not simulated.`);
sqlite.close();
