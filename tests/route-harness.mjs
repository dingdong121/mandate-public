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
const state={sends:0,deploySends:0,chain:'0x4cef52',transactions:new Map(),receipts:new Map(),nextJob:7n,throwAfterSend:false};
// Correct Testnet chain hex, computed rather than memorized.
state.chain='0x'+(5042002).toString(16);
const eventAbi=new Interface(['event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiresAt,string description)','event BudgetSet(uint256 indexed jobId,uint256 amount)','event Funded(uint256 indexed jobId,uint256 amount)','event Submitted(uint256 indexed jobId,bytes32 deliverableHash)','event Completed(uint256 indexed jobId,bytes32 reasonHash)','event Rejected(uint256 indexed jobId,bytes32 reasonHash)','event Refunded(uint256 indexed jobId,uint256 amount)','event Approval(address indexed owner,address indexed spender,uint256 value)']);
const mockCircle={async getWallet({id}){if(state.disableOnWalletRead){env.CHAIN_WRITES_ENABLED=undefined;state.disableOnWalletRead=false;}return {data:{wallet:{id,address:id.startsWith('primary')?client:agent,blockchain:state.walletNetwork??'ARC-TESTNET',accountType:'EOA'}}};},async getTransaction({id}){return {data:{transaction:state.transactions.get(id)}};},async createContractExecutionTransaction(input){state.providerRequests??=[];state.providerRequests.push(input);state.acceptedKeys??=new Map();if(state.acceptedKeys.has(input.idempotencyKey))return {data:{id:state.acceptedKeys.get(input.idempotencyKey)}};state.sends++;const id=`tx-${state.sends}`,hash='0x'+state.sends.toString(16).padStart(64,'0');state.transactions.set(id,{id,state:'INITIATED',txHash:hash});const sender=input.walletId.startsWith('primary')?client:agent;const fn=input.abiFunctionSignature.split('(')[0],p=input.abiParameters;let name,args;
 if(fn==='createJob'){name='JobCreated';args=[state.nextJob++,sender,p[0],p[1],BigInt(p[2]),p[3]];}
 if(fn==='setBudget'){name='BudgetSet';args=[BigInt(p[0]),BigInt(p[1])];}
 if(fn==='approve'){name='Approval';args=[sender,p[0],BigInt(p[1])];}
 if(fn==='fund'){name='Funded';args=[BigInt(p[0]),100000n];}
 if(fn==='submit'){name='Submitted';args=[BigInt(p[0]),p[1]];}
 if(fn==='complete'){name='Completed';args=[BigInt(p[0]),p[1]];}
 if(fn==='reject'){name='Rejected';args=[BigInt(p[0]),p[1]];}
 if(fn==='refund'){name='Refunded';args=[BigInt(p[0]),100000n];}
 const encoded=eventAbi.encodeEventLog(eventAbi.getEvent(name),args),logs=[{address:input.contractAddress,...encoded}];
 if(['fund','complete','refund'].includes(fn)){const transferAbi=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);logs.push({address:'0x3600000000000000000000000000000000000000',...transferAbi.encodeEventLog(transferAbi.getEvent('Transfer'),[fn==='fund'?sender:input.contractAddress,fn==='fund'?input.contractAddress:fn==='complete'?agent:sender,100000n])});}
 state.receipts.set(hash,{status:'0x1',transactionHash:hash,to:input.contractAddress,from:sender,logs});state.acceptedKeys.set(input.idempotencyKey,id);if(state.throwAfterSend)throw Error('simulated transport failure');return {data:{id}};}};
const env={DB:d1,CIRCLE_API_KEY:'local-mock-not-a-credential',CIRCLE_ENTITY_SECRET:'local-mock-not-a-credential',CIRCLE_PRIMARY_WALLET_ID:'primary',CIRCLE_PRIMARY_WALLET_ADDRESS:client};
const mockPlatform={async deployContract(input){state.deploySends++;state.deploymentInput=input;if(state.throwDeploy)throw Error('ambiguous deployment');return {data:{contractId:'contract-provider-id',transactionId:'deployment-tx'}};},async getContract(){return {data:{contract:state.contractMetadata}};}};
const context=vm.createContext({console,Request,Response,Headers,URL,TextEncoder,Uint8Array,crypto,AbortSignal,setTimeout,clearTimeout,fetch:async(_url,options)=>{const {method,params}=JSON.parse(options.body);if(state.rpcResponseOverride)return state.rpcResponseOverride(method,params);if(state.rpcOverride)return Response.json({result:state.rpcOverride(method,params)});let result;if(method==='eth_chainId')result=state.chain;else if(method==='eth_getCode')result='0x6000';else if(method==='eth_call')result='0x'+(100000n).toString(16);else if(method==='eth_getTransactionReceipt')result=state.receipts.get(params[0])??null;else throw Error(`Unexpected RPC ${method}`);return Response.json({result});}});
const modules=new Map();
async function moduleFor(spec,parent=root+'/entry.ts'){
 let file=spec.startsWith('@/')?path.join(root,spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(parent),spec):null;
 if(file&&!path.extname(file))file=fs.existsSync(file+'.ts')?file+'.ts':path.join(file,'index.ts');
 const id=file||spec;if(modules.has(id))return modules.get(id);
 let mod;if(file?.endsWith('.json')){const value=JSON.parse(fs.readFileSync(file,'utf8'));mod=new vm.SyntheticModule(['default'],function(){this.setExport('default',value);},{context,identifier:file});}
 else if(file){const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;mod=new vm.SourceTextModule(source,{context,identifier:file});}
 else{const exports=spec==='cloudflare:workers'?{env}:spec==='@circle-fin/developer-controlled-wallets'?{initiateDeveloperControlledWalletsClient:()=>mockCircle}:spec==='@circle-fin/smart-contract-platform'?{initiateSmartContractPlatformClient:()=>mockPlatform}:spec==='server-only'?{}:await import(spec);mod=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context,identifier:id});}
 modules.set(id,mod);return mod;
}
async function route(file){const mod=await moduleFor('@/'+file);if(mod.status==='unlinked')await mod.link((s,m)=>moduleFor(s,m.identifier));if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace;}
const fund=await route('app/api/bounties/[id]/fund/route.ts'),settle=await route('app/api/bounties/[id]/settle/route.ts'),safe=await route('lib/arc-safety.ts');
let checks=0;
function check(actual,expected){assert.equal(actual,expected);checks++;}
function seed(id='test',chain=5042002){sqlite.prepare("INSERT OR IGNORE INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES ('agent','B','Local agent','active','circle','agent-wallet',?,?)").run(agent,chain);sqlite.prepare("INSERT OR IGNORE INTO contract_deployments(id,owner_id,kind,circle_contract_id,transaction_id,contract_address,status,chain_id) VALUES ('deployment','A','bounty_escrow','local','local',?,'complete',5042002)").run(contract);sqlite.prepare("INSERT INTO bounties(id,owner_id,provider_agent_id,title,objective,acceptance_criteria,reward_micros,deadline,status,chain_id) VALUES (?,'A','agent','Local test','local objective','[]',100000,?,'draft',?)").run(id,new Date(Date.now()+3600000).toISOString(),chain);
// Explicit synthetic payer fixture for legacy regression tests; NOT a production default.
const wallet=env.CIRCLE_PRIMARY_WALLET_ID||'primary',payerId='fixture-payer-'+wallet;
sqlite.prepare("INSERT OR IGNORE INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address,chain_id) VALUES (?,'A','Synthetic payer','active','circle',?,?,?)").run(payerId,wallet,client,chain);
sqlite.prepare("INSERT OR IGNORE INTO agent_wallet_bindings(id,agent_id,owner_id,chain_id,wallet_id,wallet_address) VALUES (?,?,'A',?,?,?)").run(payerId,payerId,chain,wallet,client);
sqlite.prepare("INSERT INTO bounty_client_wallets(bounty_id,owner_id,chain_id,agent_id,wallet_id,wallet_address) VALUES (?,'A',?,?,?,?)").run(id,chain,payerId,wallet,client);
}
async function call(handler,id,method='GET',body={},user='A',key=crypto.randomUUID(),origin='https://local.test'){return handler[method](new Request(`https://local.test/api/bounties/${id}`,{method,headers:{'oai-authenticated-user-id':user,origin,'content-type':'application/json','idempotency-key':key},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({id})});}
function row(id='test'){return sqlite.prepare('SELECT * FROM bounties WHERE id=?').get(id);}
function complete(id='test',funding=true){state.transactions.get(row(id)[funding?'current_transaction_id':'settlement_transaction_id']).state='COMPLETE';}

export { env, state, sqlite, route, seed, call, row, complete, client, agent, contract };
